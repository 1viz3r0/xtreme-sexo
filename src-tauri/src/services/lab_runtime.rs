//! Docker-only practical labs. All Docker operations use discrete arguments,
//! fixed target assets, and resources labeled with an unpredictable run owner.
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::time::{Duration, Instant};

const OWNER_LABEL: &str = "io.netoze.practical.owner";
const OUTPUT_LIMIT: u64 = 64 * 1024;
const DOCKERFILE: &str = include_str!("../../../labs/web-exposure/Dockerfile");
const SERVER: &str = include_str!("../../../labs/web-exposure/server.py");
const INDEX: &str = include_str!("../../../labs/web-exposure/index.html");

const MAX_PROXY_CONNECTIONS: usize = 8;
const MAX_PROXY_REQUEST: usize = 64 * 1024;
const MAX_PROXY_RESPONSE: usize = 1024 * 1024;
const PROXY_BUFFER: usize = 16 * 1024;

/// Owns its listener and all connection workers. The upstream is fixed at
/// creation from ownership-checked Docker inspection, never HTTP/IPC input.
struct Forwarder { addr: SocketAddr, stop: Arc<AtomicBool>, worker: Option<thread::JoinHandle<()>> }
impl Forwarder {
    fn start(upstream: SocketAddr) -> Result<Self, String> {
        if !matches!(upstream, SocketAddr::V4(addr) if addr.ip().is_private() && !addr.ip().is_loopback() && addr.port() == 8000) {
            return Err("Only the inspected private container HTTP endpoint may be forwarded".into());
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|_| "Cannot bind the lab loopback forwarder")?;
        listener.set_nonblocking(true).map_err(|_| "Cannot configure the lab loopback listener")?;
        let addr = listener.local_addr().map_err(|_| "Cannot inspect the lab loopback listener")?;
        let stop = Arc::new(AtomicBool::new(false));
        let cancel = stop.clone();
        let worker = thread::Builder::new().name("netoze-lab-forwarder".into()).spawn(move || {
            let mut workers: Vec<thread::JoinHandle<()>> = Vec::new();
            while !cancel.load(Ordering::Acquire) {
                let mut i = 0;
                while i < workers.len() {
                    if workers[i].is_finished() { let _ = workers.swap_remove(i).join(); } else { i += 1; }
                }
                match listener.accept() {
                    Ok((client, peer)) if peer.ip().is_loopback() && workers.len() < MAX_PROXY_CONNECTIONS => {
                        let stop = cancel.clone();
                        if let Ok(worker) = thread::Builder::new().name("netoze-lab-connection".into()).spawn(move || relay(client, upstream, stop)) { workers.push(worker); }
                    },
                    Ok((client, _)) => { let _ = client.shutdown(Shutdown::Both); },
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(10)),
                    Err(_) => break,
                }
            }
            cancel.store(true, Ordering::Release);
            drop(listener);
            for worker in workers { let _ = worker.join(); }
        }).map_err(|_| "Cannot start the lab loopback forwarder")?;
        Ok(Self { addr, stop, worker: Some(worker) })
    }
    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() { let _ = worker.join(); }
    }
}
impl Drop for Forwarder { fn drop(&mut self) { self.shutdown(); } }

struct Direction { pending: Vec<u8>, offset: usize, received: usize, eof: bool, half_closed: bool, limit: usize }
impl Direction {
    fn new(limit: usize) -> Self { Self { pending: Vec::with_capacity(PROXY_BUFFER), offset: 0, received: 0, eof: false, half_closed: false, limit } }
    fn pump(&mut self, source: &mut TcpStream, target: &mut TcpStream) -> std::io::Result<bool> {
        let mut progress = false;
        if self.offset == self.pending.len() {
            self.pending.clear(); self.offset = 0;
            if !self.eof {
                let mut bytes = [0; PROXY_BUFFER];
                match source.read(&mut bytes) {
                    Ok(0) => self.eof = true,
                    Ok(n) => {
                        self.received += n;
                        if self.received > self.limit { return Err(std::io::Error::other("lab transfer limit")); }
                        self.pending.extend_from_slice(&bytes[..n]); progress = true;
                    },
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {},
                    Err(error) => return Err(error),
                }
            }
        }
        if self.offset < self.pending.len() {
            match target.write(&self.pending[self.offset..]) {
                Ok(0) => return Err(std::io::Error::other("lab connection closed")),
                Ok(n) => { self.offset += n; progress = true; },
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {},
                Err(error) => return Err(error),
            }
        }
        if self.eof && self.offset == self.pending.len() && !self.half_closed {
            target.shutdown(Shutdown::Write)?; self.half_closed = true;
        }
        Ok(progress)
    }
}
fn relay(mut client: TcpStream, upstream: SocketAddr, stop: Arc<AtomicBool>) {
    let Ok(mut target) = TcpStream::connect_timeout(&upstream, Duration::from_millis(300)) else { return; };
    if client.set_nonblocking(true).is_err() || target.set_nonblocking(true).is_err() { return; }
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut last_progress = Instant::now();
    let mut request = Direction::new(MAX_PROXY_REQUEST);
    let mut response = Direction::new(MAX_PROXY_RESPONSE);
    while !stop.load(Ordering::Acquire) && Instant::now() < deadline && last_progress.elapsed() < Duration::from_secs(2) {
        let progress = match (request.pump(&mut client, &mut target), response.pump(&mut target, &mut client)) {
            (Ok(a), Ok(b)) => a || b,
            _ => break,
        };
        // The original target closes each HTTP response. Finish after its
        // buffered response drains; do not wait for browser keep-alive EOF.
        if response.half_closed { break; }
        if progress { last_progress = Instant::now(); } else { thread::sleep(Duration::from_millis(5)); }
    }
    let _ = client.shutdown(Shutdown::Both);
    let _ = target.shutdown(Shutdown::Both);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabRuntimeStatus {
    pub running: bool,
    pub lab_id: Option<String>,
    pub phase: &'static str,
    pub target_url: Option<String>,
    pub message: String,
    pub runtime: &'static str,
    pub completed: bool,
}
impl Default for LabRuntimeStatus {
    fn default() -> Self { Self { running: false, lab_id: None, phase: "stopped", target_url: None, message: "No practical lab is running.".into(), runtime: "docker", completed: false } }
}

struct Run {
    owner: String,
    host: String,
    container: String,
    network: String,
    image: String,
    context: PathBuf,
    flag: String,
    url: Option<String>,
    container_created: bool,
    network_created: bool,
    image_created: bool,
    forwarder: Option<Forwarder>,
}
#[derive(Default)]
struct Inner { run: Option<Run>, status: LabRuntimeStatus }
#[derive(Default)]
pub struct LabRuntimeState { inner: Mutex<Inner> }

// No configurable executable or shell, including on the action path. Bound
// output and wall time also apply when the daemon is stuck or unavailable.
fn docker(host: Option<&str>, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = Command::new("docker");
    if let Some(host) = host { command.args(["--host", host]); }
    let mut child = command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|_| "Docker CLI is unavailable. Install Docker 28 or newer and start its local daemon.".to_string())?;
    let stdout = child.stdout.take().ok_or("Docker output unavailable")?;
    let (send_output, receive_output) = std::sync::mpsc::channel();
    thread::spawn(move || { let mut bytes = Vec::new(); let _ = stdout.take(OUTPUT_LIMIT).read_to_end(&mut bytes); let _ = send_output.send(bytes); });
    let deadline = Instant::now() + timeout;
    let result = loop {
        match child.try_wait() {
            Ok(Some(exit)) => break if exit.success() { Ok(()) } else { Err("Docker operation failed. Check the local daemon, image availability, and runtime permissions.".to_string()) },
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            _ => { let _ = child.kill(); let _ = child.wait(); break Err("Docker operation timed out or could not be monitored.".to_string()); }
        }
    };
    // CLI plugins can inherit stdout. Never block indefinitely joining a
    // reader after the direct child was killed or exited.
    let bytes = receive_output.recv_timeout(Duration::from_secs(1)).map_err(|_| "Docker output did not finish within its deadline".to_string())?;
    result?;
    String::from_utf8(bytes).map_err(|_| "Docker returned invalid output".into())
}
fn supported_version(version: &str) -> bool { version.trim().split('.').next().and_then(|v| v.parse::<u32>().ok()).is_some_and(|v| v >= 28) }
fn local_engine_host(host: &str) -> bool {
    (host.starts_with("unix:///") && !host.contains(['\n', '\r'])) || host == "npipe:////./pipe/docker_engine"
}
fn check_engine(mut execute: impl FnMut(Option<&str>, &[&str]) -> Result<String, String>) -> Result<String, String> {
    let client = execute(None, &["version", "--format", "{{.Client.Version}}"])?;
    if !supported_version(&client) { return Err("Docker 28 or newer is required.".into()); }
    let host = if let Ok(host) = std::env::var("DOCKER_HOST") { host } else {
        execute(None, &["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"] )?.trim().to_owned()
    };
    if !local_engine_host(&host) { return Err("Select a local Docker engine; remote Docker endpoints are not supported for loopback labs.".into()); }
    let server = execute(Some(&host), &["version", "--format", "{{.Server.Version}}"])?;
    if !supported_version(&server) { return Err("A running local Docker daemon version 28 or newer is required.".into()); }
    Ok(host)
}
fn entropy() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    #[cfg(unix)]
    fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes)).map_err(|_| "Secure run entropy unavailable")?;
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        extern "system" { fn BCryptGenRandom(algorithm: *mut std::ffi::c_void, buffer: *mut u8, length: u32, flags: u32) -> i32; }
        if unsafe { BCryptGenRandom(std::ptr::null_mut(), bytes.as_mut_ptr(), bytes.len() as u32, 2) } != 0 { return Err("Secure run entropy unavailable".into()); }
    }
    #[cfg(not(any(unix, windows)))]
    return Err("Secure run entropy unavailable on this platform".into());
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn create_run(host: String) -> Result<Run, String> {
    let owner = entropy()?;
    let flag = format!("NET0ZE{{web-exposure-{}}}", entropy()?);
    let context = std::env::temp_dir().join(format!("netoze-lab-{owner}"));
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
    builder.create(&context).map_err(|_| "Unable to create the private lab build context")?;
    let result = (|| {
        for (name, bytes) in [("Dockerfile", DOCKERFILE.to_owned()), ("server.py", SERVER.to_owned()), ("index.html", INDEX.to_owned()),
            ("config.json", serde_json::json!({"application":"Harborline Dispatch","environment":"training","backup_note":"Deployment mistakenly left its support backup public.","flag":flag}).to_string())] {
            fs::write(context.join(name), bytes).map_err(|_| "Unable to write bundled lab assets")?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result { let _ = fs::remove_dir_all(&context); return Err(error); }
    Ok(Run { container: format!("netoze-target-{owner}"), network: format!("netoze-network-{owner}"), image: format!("netoze-lab-{owner}:local"), owner, host, context, flag, url: None, container_created: false, network_created: false, image_created: false, forwarder: None })
}
fn run_args(run: &Run) -> Vec<String> {
    ["create", "--name", &run.container, "--label", &format!("{OWNER_LABEL}={}", run.owner), "--network", &run.network,
        "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--memory", "96m", "--memory-swap", "96m", "--pids-limit", "32", "--cpus", "0.5", "--user", "10001:10001", &run.image]
        .into_iter().map(str::to_owned).collect()
}
fn execute_run(run: &Run, args: &[&str]) -> Result<String, String> { docker(Some(&run.host), args, Duration::from_secs(15)) }
fn owned_id(run: &Run, resource: &str, name: &str) -> Option<String> {
    let format = format!("{{{{.Id}}}} {{{{index .Config.Labels \"{OWNER_LABEL}\"}}}}");
    let network_format = format!("{{{{.Id}}}} {{{{index .Labels \"{OWNER_LABEL}\"}}}}");
    let format = if resource == "network" { &network_format } else { &format };
    let output = execute_run(run, &[resource, "inspect", "--format", format, name]).ok()?;
    let (id, owner) = output.trim().split_once(' ')?;
    let digest = id.strip_prefix("sha256:").unwrap_or(id);
    if owner == run.owner && digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()) { Some(id.into()) } else { None }
}
fn remove_owned(run: &Run, resource: &str, name: &str, force: bool) -> bool {
    if let Some(id) = owned_id(run, resource, name) {
        // Remove by the inspected immutable ID, not a mutable name/tag. A
        // concurrent name replacement can never redirect removal elsewhere.
        let args = if force { vec![resource, "rm", "--force", &id] } else { vec![resource, "rm", &id] };
        return execute_run(run, &args).is_ok();
    }
    // A failed creation may have made no resource. Distinguish that from an
    // unavailable daemon without deleting or adopting any unowned object.
    let filter = format!("label={OWNER_LABEL}={}", run.owner);
    let mut args = vec![resource, "ls"];
    if resource == "container" { args.push("--all"); }
    args.extend(["--filter", &filter, "--format", "{{.ID}}"]);
    execute_run(run, &args).is_ok_and(|output| output.trim().is_empty())
}
fn cleanup(run: &mut Run) -> bool {
    // Join every local connection before removing its upstream container.
    run.forwarder.take();
    run.url = None;
    // Never prune, enumerate/remove other resources, or forcibly remove images.
    let mut healthy = true;
    if run.container_created {
        if remove_owned(run, "container", &run.container, true) { run.container_created = false; } else { healthy = false; }
    }
    if run.network_created {
        if remove_owned(run, "network", &run.network, false) { run.network_created = false; } else { healthy = false; }
    }
    if run.image_created {
        if remove_owned(run, "image", &run.image, false) { run.image_created = false; } else { healthy = false; }
    }
    if run.context.exists() && fs::remove_dir_all(&run.context).is_err() { healthy = false; }
    healthy
}
fn inspected_upstream(container: &Value, network: &Value, owner: &str, network_name: &str) -> Result<SocketAddr, String> {
    let invalid = "Target must belong exclusively to the owned internal private network";
    if container["Config"]["Labels"][OWNER_LABEL] != owner || network["Labels"][OWNER_LABEL] != owner || network["Name"] != network_name || network["Internal"] != true { return Err(invalid.into()); }
    let attachments = container["NetworkSettings"]["Networks"].as_object().ok_or(invalid)?;
    if attachments.len() != 1 { return Err(invalid.into()); }
    let attachment = attachments.get(network_name).ok_or(invalid)?;
    if attachment["NetworkID"] != network["Id"] || !network["Id"].as_str().is_some_and(|id| id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())) { return Err(invalid.into()); }
    let ip: Ipv4Addr = attachment["IPAddress"].as_str().ok_or(invalid)?.parse().map_err(|_| invalid)?;
    if !ip.is_private() || ip.is_loopback() { return Err(invalid.into()); }
    let container_id = container["Id"].as_str().ok_or(invalid)?;
    let endpoint = network["Containers"][container_id]["IPv4Address"].as_str().ok_or(invalid)?;
    let endpoint: ipnet::Ipv4Net = endpoint.parse().map_err(|_| invalid)?;
    if endpoint.addr() != ip { return Err(invalid.into()); }
    let subnet_matches = network["IPAM"]["Config"].as_array().ok_or(invalid)?.iter().any(|config| {
        let Some(subnet) = config["Subnet"].as_str().and_then(|v| v.parse::<ipnet::Ipv4Net>().ok()) else { return false; };
        subnet.network().is_private() && subnet.broadcast().is_private() && subnet.contains(&ip)
            && subnet.prefix_len() == endpoint.prefix_len() && ip != subnet.network() && ip != subnet.broadcast()
            && config["Gateway"].as_str().and_then(|v| v.parse::<Ipv4Addr>().ok()) != Some(ip)
    });
    if !subnet_matches { return Err(invalid.into()); }
    Ok(SocketAddr::from((ip, 8000)))
}
fn launch(run: &mut Run) -> Result<(), String> {
    let context = run.context.to_str().ok_or("Invalid private build context path")?;
    let label = format!("{OWNER_LABEL}={}", run.owner);
    // Mark attempted creations before dispatch: ambiguous CLI failures retain
    // ownership-checked cleanup rather than assuming no resource was created.
    run.image_created = true;
    docker(Some(&run.host), &["build", "--network", "none", "--label", &label, "--tag", &run.image, context], Duration::from_secs(180))?;
    fs::remove_dir_all(&run.context).map_err(|_| "Unable to remove the private lab build context")?;
    run.network_created = true;
    execute_run(run, &["network", "create", "--internal", "--label", &label, &run.network])?;
    if owned_id(run, "network", &run.network).is_none() || execute_run(run, &["network", "inspect", "--format", "{{.Internal}}", &run.network])?.trim() != "true" {
        return Err("The managed network is not an owned internal Docker network".into());
    }
    let args = run_args(run);
    run.container_created = true;
    execute_run(run, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    execute_run(run, &["container", "start", &run.container])?;
    let container_id = owned_id(run, "container", &run.container).ok_or("Target container ownership is unavailable")?;
    let network_id = owned_id(run, "network", &run.network).ok_or("Target network ownership is unavailable")?;
    let container: Value = serde_json::from_str(&execute_run(run, &["container", "inspect", "--format", "{{json .}}", &container_id])?).map_err(|_| "Invalid target inspection")?;
    let network: Value = serde_json::from_str(&execute_run(run, &["network", "inspect", "--format", "{{json .}}", &network_id])?).map_err(|_| "Invalid network inspection")?;
    let upstream = inspected_upstream(&container, &network, &run.owner, &run.network)?;
    let forwarder = Forwarder::start(upstream)?;
    let port = forwarder.addr.port();
    let url = format!("http://127.0.0.1:{port}/");
    run.forwarder = Some(forwarder);
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(mut stream) = TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_millis(300)) {
            use std::io::Write;
            let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
            if stream.write_all(format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes()).is_ok() {
                let mut bytes = [0; 256];
                if stream.read(&mut bytes).is_ok_and(|n| n > 0 && bytes[..n].starts_with(b"HTTP/1.0 200")) { break; }
            }
        }
        if Instant::now() >= deadline { return Err("Container started but the loopback target did not become healthy.".into()); }
        thread::sleep(Duration::from_millis(100));
    }
    run.url = Some(url);
    Ok(())
}
fn same_flag(expected: &str, supplied: &str) -> bool {
    let mut difference = expected.len() ^ supplied.len();
    for (i, byte) in expected.bytes().enumerate() { difference |= (byte ^ supplied.as_bytes().get(i).copied().unwrap_or(0)) as usize; }
    difference == 0
}
impl LabRuntimeState {
    // lib.rs uses this constructor. Flags and active containers are deliberately
    // not persisted or resumed; each launch is a new isolated target.
    pub fn persistent() -> Self { Self::default() }
    pub fn start(&self, lab_id: String) -> Result<LabRuntimeStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        Self::start_locked(&mut inner, lab_id)
    }
    fn start_locked(inner: &mut Inner, lab_id: String) -> Result<LabRuntimeStatus, String> {
        if lab_id != "web-exposure" { return Err("Unknown practical lab; choose web-exposure".into()); }
        if inner.run.is_some() { return Err("Stop the current lab or finish its cleanup before starting another".into()); }
        let host = match check_engine(|host, args| docker(host, args, Duration::from_secs(10))) {
            Ok(host) => host,
            Err(message) => { inner.status = LabRuntimeStatus { lab_id: Some(lab_id), phase: "setup-required", message, ..LabRuntimeStatus::default() }; return Ok(inner.status.clone()); }
        };
        let mut run = match create_run(host) {
            Ok(run) => run,
            Err(message) => { inner.status = LabRuntimeStatus { lab_id: Some(lab_id), phase: "error", message, ..LabRuntimeStatus::default() }; return Ok(inner.status.clone()); }
        };
        match launch(&mut run) {
            Ok(()) => { inner.status = LabRuntimeStatus { running: true, lab_id: Some(lab_id), phase: "running", target_url: run.url.clone(), message: "Harborline Dispatch is ready. Discover its exposed backup, recover the deployment config, and submit the flag.".into(), runtime: "docker", completed: false }; inner.run = Some(run); }
            Err(message) => { let clean = cleanup(&mut run); inner.status = LabRuntimeStatus { lab_id: Some(lab_id), phase: "error", message: if clean { message } else { format!("{message} Owned-resource cleanup remains pending; use Stop after repairing Docker access.") }, ..LabRuntimeStatus::default() }; if !clean { inner.run = Some(run); } }
        }
        Ok(inner.status.clone())
    }
    pub fn status(&self) -> Result<LabRuntimeStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        if inner.status.running {
            let run = inner.run.as_ref().ok_or("Active target is unavailable")?;
            if run.forwarder.as_ref().is_none_or(|proxy| proxy.worker.as_ref().is_none_or(|worker| worker.is_finished())) || owned_id(run, "container", &run.container).is_none() || !execute_run(run, &["container", "inspect", "--format", "{{.State.Running}}", &run.container]).is_ok_and(|v| v.trim() == "true") {
                if let Some(run) = inner.run.as_mut() { run.forwarder.take(); run.url = None; }
                inner.status.running = false; inner.status.phase = "error"; inner.status.target_url = None; inner.status.message = "The managed container is unavailable. Stop to clean up before restarting.".into();
            }
        }
        Ok(inner.status.clone())
    }
    pub fn stop(&self) -> Result<LabRuntimeStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        Self::stop_locked(&mut inner)
    }
    fn stop_locked(inner: &mut Inner) -> Result<LabRuntimeStatus, String> {
        if let Some(run) = inner.run.as_mut() {
            if !cleanup(run) { inner.status.running = false; inner.status.phase = "error"; inner.status.target_url = None; inner.status.message = "Owned-resource cleanup is pending. Restore Docker access and use Stop again.".into(); return Ok(inner.status.clone()); }
        }
        inner.run = None; inner.status = LabRuntimeStatus::default(); Ok(inner.status.clone())
    }
    pub fn reset(&self) -> Result<LabRuntimeStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        if inner.status.lab_id.is_none() { return Err("No practical lab to reset".into()); }
        let stopped = Self::stop_locked(&mut inner)?;
        if stopped.phase != "stopped" { return Ok(stopped); }
        Self::start_locked(&mut inner, "web-exposure".into())
    }
    pub fn action(&self, action: Value) -> Result<LabRuntimeStatus, String> {
        self.status()?;
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        Self::submit_locked(&mut inner, action)
    }
    fn submit_locked(inner: &mut Inner, action: Value) -> Result<LabRuntimeStatus, String> {
        let object = action.as_object().ok_or("Expected submit_flag action")?;
        if object.len() != 2 || action["action"] != "submit_flag" { return Err("Only submit_flag with a flag string is supported".into()); }
        let supplied = action["flag"].as_str().filter(|v| v.len() <= 256).ok_or("Flag must be a bounded string")?;
        if !inner.status.running { return Err("No running container lab".into()); }
        let run = inner.run.as_ref().ok_or("No running container lab")?;
        if same_flag(&run.flag, supplied) { inner.status.completed = true; inner.status.message = "Flag verified. The exposed deployment backup has been recovered.".into(); }
        else { inner.status.message = "Flag rejected. Inspect the target's exposed backup and deployment config.".into(); }
        Ok(inner.status.clone())
    }
    pub fn open(&self) -> Result<LabRuntimeStatus, String> {
        let status = self.status()?;
        let inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        let run = inner.run.as_ref().ok_or("No running container lab")?;
        let url = status.target_url.as_deref().ok_or("No running container lab")?;
        if !status.running || run.url.as_deref() != Some(url) || !url.starts_with("http://127.0.0.1:") || !url.ends_with('/') { return Err("Only the owned loopback target may be opened".into()); }
        #[cfg(target_os = "linux")]
        let result = Command::new("xdg-open").arg(url).status();
        #[cfg(target_os = "macos")]
        let result = Command::new("/usr/bin/open").arg(url).status();
        #[cfg(windows)]
        let result = Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", url]).status();
        #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
        return Err("Platform URL opener unavailable".into());
        #[cfg(any(target_os = "linux", target_os = "macos", windows))]
        if result.is_ok_and(|exit| exit.success()) { Ok(status) } else { Err("Could not open the owned target URL".into()) }
    }
}
impl Drop for LabRuntimeState { fn drop(&mut self) { let inner = self.inner.get_mut().unwrap_or_else(|poisoned| poisoned.into_inner()); if let Some(run) = inner.run.as_mut() { let _ = cleanup(run); } } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_docker_and_old_versions_require_setup() {
        assert!(check_engine(|_, _| Err("Docker CLI unavailable".into())).is_err());
        assert!(check_engine(|_, _| Ok("27.5.0".into())).unwrap_err().contains("28"));
        assert!(supported_version("28.0.0")); assert!(supported_version("29.1.0")); assert!(!supported_version("unknown"));
        assert!(check_engine(|host, args| {
            if host.is_some() { Err("Local daemon unavailable".into()) }
            else if args[0] == "context" { Ok("unix:///var/run/docker.sock".into()) }
            else { Ok("28.0.0".into()) }
        }).is_err());
    }
    #[test]
    fn mappings_and_daemon_endpoints_are_strictly_local() {
        assert!(local_engine_host("unix:///var/run/docker.sock"));
        assert!(!local_engine_host("tcp://example.com:2375"));
        let id = "a".repeat(64);
        let container_id = "b".repeat(64);
        let container = serde_json::json!({"Id":container_id,"Config":{"Labels":{OWNER_LABEL:"owner"}},"NetworkSettings":{"Networks":{"owned":{"NetworkID":id,"IPAddress":"172.22.0.2"}}}});
        let network = serde_json::json!({"Id":id,"Name":"owned","Internal":true,"Labels":{OWNER_LABEL:"owner"},"IPAM":{"Config":[{"Subnet":"172.22.0.0/16","Gateway":"172.22.0.1"}]},"Containers":{container_id:{"IPv4Address":"172.22.0.2/16"}}});
        assert_eq!(inspected_upstream(&container, &network, "owner", "owned").unwrap(), "172.22.0.2:8000".parse::<SocketAddr>().unwrap());
        for ip in ["127.0.0.1", "1.1.1.1", "172.23.0.2", "172.22.0.1", "172.22.0.0", "172.22.255.255"] {
            let mut bad = container.clone(); bad["NetworkSettings"]["Networks"]["owned"]["IPAddress"] = Value::String(ip.into());
            assert!(inspected_upstream(&bad, &network, "owner", "owned").is_err());
        }
        for key in ["Id", "Name", "Internal", "Labels", "IPAM", "Containers"] {
            let mut bad = network.clone(); bad[key] = Value::Null;
            assert!(inspected_upstream(&container, &bad, "owner", "owned").is_err());
        }
        assert!(inspected_upstream(&container, &network, "other-owner", "owned").is_err());
        let mut extra = container.clone(); extra["NetworkSettings"]["Networks"]["other"] = serde_json::json!({});
        assert!(inspected_upstream(&extra, &network, "owner", "owned").is_err());
        assert!(Forwarder::start("127.0.0.1:8000".parse().unwrap()).is_err());
        assert!(Forwarder::start("1.1.1.1:8000".parse().unwrap()).is_err());
    }
    #[test]
    fn sandbox_args_and_flag_comparison() {
        let mut run = create_run("unix:///var/run/docker.sock".into()).unwrap();
        let args = run_args(&run);
        for required in ["--read-only", "--cap-drop", "ALL", "no-new-privileges:true", "--memory", "--pids-limit", "--cpus", "10001:10001"] { assert!(args.iter().any(|arg| arg == required)); }
        for forbidden in ["--privileged", "--volume", "--mount", "--network=host", "--publish", "-p", "-P"] { assert!(!args.iter().any(|arg| arg == forbidden)); }
        assert!(same_flag(&run.flag, &run.flag)); assert!(!same_flag(&run.flag, "wrong")); assert!(!same_flag(&run.flag, &(run.flag.clone() + "x")));
        let next = create_run(run.host.clone()).unwrap(); assert_ne!(next.flag, run.flag); assert_ne!(next.owner, run.owner);
        fs::remove_dir_all(next.context).unwrap(); assert!(cleanup(&mut run));
    }
    #[test]
    fn connection_relay_cancellation_joins_and_transfer_limit_is_enforced() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (incoming, _) = listener.accept().unwrap();
        let target = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let upstream = target.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let cancel = stop.clone();
        let worker = thread::spawn(move || relay(incoming, upstream, cancel));
        let (_target_connection, _) = target.accept().unwrap();
        let started = Instant::now();
        stop.store(true, Ordering::Release);
        worker.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(1));
        client.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        assert_eq!(client.read(&mut [0; 1]).unwrap(), 0);

        let mut producer = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut source, _) = listener.accept().unwrap();
        let mut receiver = TcpStream::connect(target.local_addr().unwrap()).unwrap();
        let (mut destination, _) = target.accept().unwrap();
        source.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        producer.write_all(b"12345").unwrap();
        let mut direction = Direction::new(4);
        assert!(direction.pump(&mut source, &mut destination).is_err());
        receiver.set_nonblocking(true).unwrap();
        assert_eq!(receiver.read(&mut [0; 1]).unwrap_err().kind(), std::io::ErrorKind::WouldBlock);
    }
    #[test]
    fn submission_contract_has_no_flag_leak_and_rejects_extra_inputs() {
        // Verifier unit test only: no claim of a running container acceptance.
        let mut run = create_run("unix:///var/run/docker.sock".into()).unwrap();
        let flag = run.flag.clone();
        run.url = Some("http://127.0.0.1:49123/".into());
        let state = LabRuntimeState::default();
        {
            let mut inner = state.inner.lock().unwrap();
            inner.status = LabRuntimeStatus { running: true, lab_id: Some("web-exposure".into()), phase: "running", target_url: run.url.clone(), ..LabRuntimeStatus::default() };
            inner.run = Some(run);
        }
        {
            let mut inner = state.inner.lock().unwrap();
            for bad in [serde_json::json!({"action":"execute","command":"id"}), serde_json::json!({"action":"submit_flag","flag":flag,"command":"id"})] { assert!(LabRuntimeState::submit_locked(&mut inner, bad).is_err()); }
            let rejected = LabRuntimeState::submit_locked(&mut inner, serde_json::json!({"action":"submit_flag","flag":"wrong"})).unwrap();
            assert!(!rejected.completed);
            let accepted = LabRuntimeState::submit_locked(&mut inner, serde_json::json!({"action":"submit_flag","flag":flag})).unwrap();
            assert!(accepted.completed); assert!(!serde_json::to_string(&accepted).unwrap().contains("NET0ZE{"));
        }
        assert!(state.stop().unwrap().phase == "stopped");
    }
    #[test]
    #[ignore = "Requires Docker >=28; verifies effective container sandbox configuration"]
    fn docker_effective_sandbox_and_internal_network() {
        let state = LabRuntimeState::default();
        let status = state.start("web-exposure".into()).unwrap();
        assert!(status.running, "{}", status.message);
        let listener_addr;
        {
            let inner = state.inner.lock().unwrap();
            let run = inner.run.as_ref().unwrap();
            let output = execute_run(run, &["container", "inspect", "--format", "{{json .}}", &run.container]).unwrap();
            let container: Value = serde_json::from_str(&output).unwrap();
            let config = &container["HostConfig"];
            assert_eq!(config["ReadonlyRootfs"], true); assert_eq!(config["Privileged"], false);
            assert_eq!(container["Config"]["User"], "10001:10001");
            assert!(config["CapDrop"].as_array().unwrap().iter().any(|v| v.as_str().is_some_and(|v| v.eq_ignore_ascii_case("all"))));
            assert!(config["SecurityOpt"].as_array().unwrap().iter().any(|v| v.as_str().is_some_and(|v| v.starts_with("no-new-privileges"))));
            assert_eq!(config["Memory"], 96 * 1024 * 1024); assert_eq!(config["PidsLimit"], 32);
            assert_eq!(config["NanoCpus"], 500_000_000);
            assert!(container["Mounts"].as_array().unwrap().is_empty());
            assert!(config["PortBindings"].is_null() || config["PortBindings"].as_object().is_some_and(|v| v.is_empty()));
            assert!(container["NetworkSettings"]["Ports"]["8000/tcp"].is_null());
            let proxy = run.forwarder.as_ref().unwrap();
            listener_addr = proxy.addr;
            assert_eq!(proxy.addr.ip(), "127.0.0.1".parse::<std::net::IpAddr>().unwrap());
            assert!(TcpStream::connect(proxy.addr).is_ok());
            let other_loopback = TcpListener::bind(("127.0.0.2", proxy.addr.port())).unwrap();
            drop(other_loopback);
            assert_eq!(execute_run(run, &["network", "inspect", "--format", "{{.Internal}}", &run.network]).unwrap().trim(), "true");
            let probe = "import socket\nfrom pathlib import Path\nroutes = Path('/proc/net/route').read_text().splitlines()[1:]\nassert not any(line.split()[1] == '00000000' for line in routes if line.split())\ntry:\n s = socket.create_connection(('1.1.1.1', 443), timeout=2)\nexcept OSError:\n print('egress-denied')\nelse:\n s.close()\n raise SystemExit('Unexpected external access')";
            assert_eq!(execute_run(run, &["container", "exec", &run.container, "python", "-I", "-c", probe]).unwrap().trim(), "egress-denied");
            assert!(owned_id(run, "container", &run.container).is_some());
            assert!(owned_id(run, "image", &run.image).is_some());
            // Unexpected target termination must also cancel the local proxy
            // before status returns an error, even before explicit Stop.
            let id = owned_id(run, "container", &run.container).unwrap();
            execute_run(run, &["container", "stop", "--time", "1", &id]).unwrap();
        }
        let unavailable = state.status().unwrap();
        assert_eq!(unavailable.phase, "error"); assert!(!unavailable.running);
        assert!(unavailable.target_url.is_none());
        assert!(TcpStream::connect(listener_addr).is_err());
        assert_eq!(state.stop().unwrap().phase, "stopped");
    }
}
