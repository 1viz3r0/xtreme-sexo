//! Docker-only practical labs. All Docker operations use discrete arguments,
//! fixed target assets, and resources labeled with an unpredictable run owner.
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, Arc, atomic::{AtomicBool, AtomicUsize, Ordering}};
use std::thread;
use std::time::{Duration, Instant};

const OWNER_LABEL: &str = "io.netoze.practical.owner";
const OUTPUT_LIMIT: u64 = 64 * 1024;
const DOCKERFILE: &str = include_str!("../../../labs/web-exposure/Dockerfile");
const SERVER: &str = include_str!("../../../labs/web-exposure/server.py");
const INDEX: &str = include_str!("../../../labs/web-exposure/index.html");
const NETWORK_DOCKERFILE: &str = include_str!("../../../labs/network-enumeration/Dockerfile");
const NETWORK_SERVER: &str = include_str!("../../../labs/network-enumeration/server.py");
const LINUX_DOCKERFILE: &str = include_str!("../../../labs/linux-permissions/Dockerfile");
const LINUX_SERVER: &str = include_str!("../../../labs/linux-permissions/server.py");
const HEADER_DOCKERFILE: &str = include_str!("../../../labs/header-trail/Dockerfile");
const HEADER_SERVER: &str = include_str!("../../../labs/header-trail/server.py");
const PROTOCOL_DOCKERFILE: &str = include_str!("../../../labs/protocol-archive/Dockerfile");
const PROTOCOL_SERVER: &str = include_str!("../../../labs/protocol-archive/server.py");
const FIRST_CONTACT_DOCKERFILE: &str = include_str!("../../../labs/first-contact/Dockerfile");
const FIRST_CONTACT_SERVER: &str = include_str!("../../../labs/first-contact/server.py");
const SERVICE_SIGNALS_DOCKERFILE: &str = include_str!("../../../labs/service-signals/Dockerfile");
const SERVICE_SIGNALS_SERVER: &str = include_str!("../../../labs/service-signals/server.py");

const MAX_PROXY_CONNECTIONS: usize = 8;
const MAX_PROXY_REQUEST: usize = 64 * 1024;
const MAX_PROXY_RESPONSE: usize = 1024 * 1024;
const PROXY_BUFFER: usize = 16 * 1024;
const LAB_IDS: &[&str] = &["web-exposure", "network-enumeration", "linux-permissions", "header-trail", "protocol-archive", "first-contact", "service-signals"];
fn has_console(lab: &str) -> bool { matches!(lab, "network-enumeration" | "header-trail" | "protocol-archive") }

/// Owns its listener and all connection workers. The upstream is fixed at
/// creation from ownership-checked Docker inspection, never HTTP/IPC input.
struct Forwarder { addr: SocketAddr, stop: Arc<AtomicBool>, worker: Option<thread::JoinHandle<()>> }
impl Forwarder {
    fn start(upstream: SocketAddr) -> Result<Self, String> {
        if !matches!(upstream, SocketAddr::V4(addr) if addr.ip().is_private() && !addr.ip().is_loopback() && matches!(addr.port(), 8000 | 9000)) {
            return Err("Only inspected private container endpoints on fixed ports 8000/9000 may be forwarded".into());
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
    pub console_addr: Option<String>,
    pub message: String,
    pub runtime: &'static str,
    pub completed: bool,
}
impl Default for LabRuntimeStatus {
    fn default() -> Self { Self { running: false, lab_id: None, phase: "stopped", target_url: None, console_addr: None, message: "No practical lab is running.".into(), runtime: "docker", completed: false } }
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
    console: Option<Forwarder>,
    executor: Arc<dyn Executor>,
}
#[derive(Default)]
struct Inner { run: Option<Run>, status: LabRuntimeStatus }
pub struct LabRuntimeState {
    inner: Mutex<Inner>,
    operation: Mutex<()>,
    startup: Mutex<Option<Arc<AtomicBool>>>,
    stopping: AtomicUsize,
    generation: AtomicUsize,
    closed: AtomicBool,
    executor: Arc<dyn Executor>,
}
impl Default for LabRuntimeState {
    fn default() -> Self { Self::with_executor(Arc::new(SystemExecutor)) }
}

trait Executor: Send + Sync {
    fn docker(&self, host: Option<&str>, args: &[&str], timeout: Duration, cancel: &AtomicBool) -> Result<String, String>;
    fn open(&self, url: &str) -> Result<(), String>;
    fn ready(&self, http: SocketAddr, console: Option<SocketAddr>, cancel: &AtomicBool) -> Result<(), String> {
        wait_ready(http, console, cancel)
    }
}
struct SystemExecutor;
impl Executor for SystemExecutor {
    fn docker(&self, host: Option<&str>, args: &[&str], timeout: Duration, cancel: &AtomicBool) -> Result<String, String> {
        run_command(docker_command(host, args), timeout, cancel)
    }
    fn open(&self, url: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        let mut command = Command::new("xdg-open");
        #[cfg(target_os = "macos")]
        let mut command = Command::new("/usr/bin/open");
        #[cfg(windows)]
        let mut command = { let mut command = Command::new("rundll32.exe"); command.arg("url.dll,FileProtocolHandler"); command };
        #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
        return Err("Platform URL opener unavailable".into());
        #[cfg(any(target_os = "linux", target_os = "macos", windows))]
        { command.arg(url); run_command_output(command, Duration::from_secs(5), &AtomicBool::new(false), false).map(|_| ()) }
    }
}

fn docker_command(host: Option<&str>, args: &[&str]) -> Command {
    let mut command = Command::new("docker");
    // A local daemon does not imply a local Buildx builder. Ignore inherited
    // builder/context overrides and explicitly select the daemon-bound builder.
    command.env_remove("BUILDKIT_HOST").env("BUILDX_BUILDER", "default");
    if let Some(host) = host { command.env_remove("DOCKER_CONTEXT").args(["--host", host]); }
    command.args(args);
    command
}

// No configurable executable or shell, including on the action path. Bound
// output and wall time also apply when the daemon is stuck or unavailable.
fn run_command(command: Command, timeout: Duration, cancel: &AtomicBool) -> Result<String, String> {
    run_command_output(command, timeout, cancel, true)
}
fn run_command_output(mut command: Command, timeout: Duration, cancel: &AtomicBool, capture: bool) -> Result<String, String> {
    if cancel.load(Ordering::Acquire) { return Err("Lab startup cancelled.".into()); }
    #[cfg(unix)]
    { use std::os::unix::process::CommandExt; command.process_group(0); }
    let mut child = command.stdin(Stdio::null()).stdout(if capture { Stdio::piped() } else { Stdio::null() }).stderr(Stdio::null())
        .spawn().map_err(|_| "Required local executable is unavailable. Check Docker 28+ and the system URL opener.".to_string())?;
    let receive_output = child.stdout.take().map(|mut stdout| {
        let (send_output, receive_output) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.by_ref().take(OUTPUT_LIMIT).read_to_end(&mut bytes);
            // Drain the remainder instead of breaking a verbose build's pipe.
            let _ = std::io::copy(&mut stdout, &mut std::io::sink());
            let _ = send_output.send(bytes);
        });
        receive_output
    });
    let deadline = Instant::now() + timeout;
    let mut terminated = false;
    let result = loop {
        if cancel.load(Ordering::Acquire) {
            terminate_child(&mut child);
            terminated = true;
            break Err("Lab startup cancelled.".to_string());
        }
        match child.try_wait() {
            Ok(Some(exit)) => break if exit.success() { Ok(()) } else {
                terminate_child(&mut child); terminated = true;
                Err("Local executable failed. Check Docker access, image availability, or the system URL opener.".to_string())
            },
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            _ => { terminate_child(&mut child); terminated = true; break Err("Local operation timed out or could not be monitored.".to_string()); }
        }
    };
    // CLI plugins can inherit stdout. Never block indefinitely joining a
    // reader after the direct child was killed or exited.
    // URL openers intentionally use null output: a successfully launched
    // browser may outlive its launcher and must not keep a capture pipe open.
    let bytes = if let Some(receive_output) = receive_output {
        match receive_output.recv_timeout(Duration::from_secs(1)) {
            Ok(bytes) => bytes,
            Err(_) => {
                if !terminated { terminate_child(&mut child); }
                return Err("Local executable output did not finish within its deadline".into());
            }
        }
    } else { Vec::new() };
    result?;
    String::from_utf8(bytes).map_err(|_| "Local executable returned invalid output".into())
}
fn terminate_child(child: &mut std::process::Child) {
    // Only our spawned process group: include inherited-output CLI plugins,
    // never enumerate or signal unrelated processes.
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(child.id()) {
        unsafe extern "C" { fn kill(pid: i32, signal: i32) -> i32; }
        unsafe { kill(-pid, 9); }
    }
    let _ = child.kill(); let _ = child.wait();
}
fn supported_version(version: &str) -> bool { version.trim().split('.').next().and_then(|v| v.parse::<u32>().ok()).is_some_and(|v| v >= 28) }
fn local_engine_host(host: &str) -> bool {
    (host.starts_with("unix:///") && !host.contains(['\n', '\r'])) || host == "npipe:////./pipe/docker_engine"
}
fn check_engine(execute: impl FnMut(Option<&str>, &[&str]) -> Result<String, String>) -> Result<String, String> {
    // Respect context selection while reading local metadata, then use only
    // the validated host for every daemon operation (including cleanup).
    let context_selected = std::env::var("DOCKER_CONTEXT").is_ok_and(|context| !context.is_empty());
    check_engine_host(if context_selected { None } else { std::env::var("DOCKER_HOST").ok() }, execute)
}
fn check_engine_host(host: Option<String>, mut execute: impl FnMut(Option<&str>, &[&str]) -> Result<String, String>) -> Result<String, String> {
    let host = if let Some(host) = host { host } else {
        execute(None, &["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"] )?.trim().to_owned()
    };
    if !local_engine_host(&host) { return Err("Select a local Docker engine; remote Docker endpoints are not supported for loopback labs.".into()); }
    let client = execute(Some(&host), &["version", "--format", "{{.Client.Version}}"])?;
    if !supported_version(&client) { return Err("Docker 28 or newer is required.".into()); }
    let server = execute(Some(&host), &["version", "--format", "{{.Server.Version}}"])?;
    if !supported_version(&server) { return Err("A running local Docker daemon version 28 or newer is required.".into()); }
    let platform = execute(Some(&host), &["info", "--format", "{{.OSType}}|{{.OperatingSystem}}|{{json .SecurityOptions}}"])?;
    if !cfg!(target_os = "linux") || !platform.starts_with("linux|") || platform.to_ascii_lowercase().contains("docker desktop") || platform.contains("rootless") {
        return Err("Labs require native Linux Docker Engine with host-reachable bridge networking. Docker Desktop and rootless engines are not supported.".into());
    }
    Ok(host)
}
fn entropy() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|_| "Secure run entropy unavailable")?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn create_run(host: String, lab_id: &str) -> Result<Run, String> {
    let owner = entropy()?;
    let flag = format!("NET0ZE{{{}-{}}}", lab_id, entropy()?);
    let context = std::env::temp_dir().join(format!("netoze-lab-{owner}"));
    let builder = fs::DirBuilder::new();
    #[cfg(unix)]
    let mut builder = builder;
    #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
    builder.create(&context).map_err(|_| "Unable to create the private lab build context")?;
    let result = (|| {
        let (dockerfile, server, mut config) = match lab_id {
            "web-exposure" => (DOCKERFILE, SERVER, serde_json::json!({"application":"Harborline Dispatch","environment":"training","backup_note":"Deployment mistakenly left its support backup public."})),
            "network-enumeration" => (NETWORK_DOCKERFILE, NETWORK_SERVER, serde_json::json!({"application":"Northstar Yard","site":"Northstar Yard","environment":"training"})),
            "linux-permissions" => (LINUX_DOCKERFILE, LINUX_SERVER, serde_json::json!({"application":"Ledger Sync Permission Review","environment":"training"})),
            "header-trail" => (HEADER_DOCKERFILE, HEADER_SERVER, serde_json::json!({"application":"Signal Kiosk","environment":"training"})),
            "protocol-archive" => (PROTOCOL_DOCKERFILE, PROTOCOL_SERVER, serde_json::json!({"application":"Copperline Protocol Archive","environment":"training"})),
            "first-contact" => (FIRST_CONTACT_DOCKERFILE, FIRST_CONTACT_SERVER, serde_json::json!({"application":"First Contact","environment":"training"})),
            "service-signals" => (SERVICE_SIGNALS_DOCKERFILE, SERVICE_SIGNALS_SERVER, serde_json::json!({"application":"Service Signals","environment":"training"})),
            _ => return Err("Unknown practical lab".into()),
        };
        config["flag"] = serde_json::Value::String(flag.clone());
        let mut assets = vec![("Dockerfile", dockerfile.to_owned()), ("server.py", server.to_owned()),
            ("config.json", config.to_string())];
        if lab_id == "web-exposure" { assets.push(("index.html", INDEX.to_owned())); }
        for (name, bytes) in assets {
            fs::write(context.join(name), bytes).map_err(|_| "Unable to write bundled lab assets")?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result { let _ = fs::remove_dir_all(&context); return Err(error); }
    Ok(Run { container: format!("netoze-target-{owner}"), network: format!("netoze-network-{owner}"), image: format!("netoze-lab-{owner}:local"), owner, host, context, flag, url: None, container_created: false, network_created: false, image_created: false, forwarder: None, console: None, executor: Arc::new(SystemExecutor) })
}
fn run_args(run: &Run) -> Vec<String> {
    ["create", "--name", &run.container, "--label", &format!("{OWNER_LABEL}={}", run.owner), "--network", &run.network,
        "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--memory", "96m", "--memory-swap", "96m", "--pids-limit", "32", "--cpus", "0.5", "--user", "10001:10001", &run.image]
        .into_iter().map(str::to_owned).collect()
}
fn execute_run(run: &Run, args: &[&str]) -> Result<String, String> { run.executor.docker(Some(&run.host), args, Duration::from_secs(15), &AtomicBool::new(false)) }
fn owned_id(run: &Run, resource: &str, name: &str) -> Option<String> {
    owned_id_with_cancel(run, resource, name, &AtomicBool::new(false))
}
fn owned_id_with_cancel(run: &Run, resource: &str, name: &str, cancel: &AtomicBool) -> Option<String> {
    let format = format!("{{{{.Id}}}} {{{{index .Config.Labels \"{OWNER_LABEL}\"}}}}");
    let network_format = format!("{{{{.Id}}}} {{{{index .Labels \"{OWNER_LABEL}\"}}}}");
    let format = if resource == "network" { &network_format } else { &format };
    let output = run.executor.docker(Some(&run.host), &[resource, "inspect", "--format", format, name], Duration::from_secs(3), cancel).ok()?;
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
    run.console.take();
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
impl Drop for Run { fn drop(&mut self) { let _ = cleanup(self); } }
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
fn launch(run: &mut Run, lab_id: &str, cancel: &AtomicBool) -> Result<(), String> {
    let context = run.context.to_str().ok_or("Invalid private build context path")?;
    let label = format!("{OWNER_LABEL}={}", run.owner);
    // Mark attempted creations before dispatch: ambiguous CLI failures retain
    // ownership-checked cleanup rather than assuming no resource was created.
    run.image_created = true;
    run.executor.docker(Some(&run.host), &["build", "--network", "none", "--label", &label, "--tag", &run.image, context], Duration::from_secs(180), cancel)?;
    fs::remove_dir_all(&run.context).map_err(|_| "Unable to remove the private lab build context")?;
    run.network_created = true;
    let execute = |args: &[&str]| run.executor.docker(Some(&run.host), args, Duration::from_secs(15), cancel);
    execute(&["network", "create", "--internal", "--label", &label, &run.network])?;
    if owned_id_with_cancel(run, "network", &run.network, cancel).is_none() || execute(&["network", "inspect", "--format", "{{.Internal}}", &run.network])?.trim() != "true" {
        return Err("The managed network is not an owned internal Docker network".into());
    }
    let args = run_args(run);
    run.container_created = true;
    execute(&args.iter().map(String::as_str).collect::<Vec<_>>())?;
    execute(&["container", "start", &run.container])?;
    let container_id = owned_id_with_cancel(run, "container", &run.container, cancel).ok_or("Target container ownership is unavailable")?;
    let network_id = owned_id_with_cancel(run, "network", &run.network, cancel).ok_or("Target network ownership is unavailable")?;
    let container: Value = serde_json::from_str(&execute(&["container", "inspect", "--format", "{{json .}}", &container_id])?).map_err(|_| "Invalid target inspection")?;
    let network: Value = serde_json::from_str(&execute(&["network", "inspect", "--format", "{{json .}}", &network_id])?).map_err(|_| "Invalid network inspection")?;
    let upstream = inspected_upstream(&container, &network, &run.owner, &run.network)?;
    let forwarder = Forwarder::start(upstream)?;
    let addr = forwarder.addr;
    let port = addr.port();
    let url = format!("http://127.0.0.1:{port}/");
    run.forwarder = Some(forwarder);
    if has_console(lab_id) { run.console = Some(Forwarder::start(SocketAddr::new(upstream.ip(), 9000))?); }
    run.executor.ready(addr, run.console.as_ref().map(|console| console.addr), cancel)?;
    run.url = Some(url);
    Ok(())
}
fn wait_ready(http: SocketAddr, console: Option<SocketAddr>, cancel: &AtomicBool) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if cancel.load(Ordering::Acquire) { return Err("Lab startup cancelled.".into()); }
        if let Ok(mut stream) = TcpStream::connect_timeout(&http, Duration::from_millis(300)) {
            use std::io::Write;
            let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
            if stream.write_all(format!("GET /health HTTP/1.1\r\nHost: {http}\r\nConnection: close\r\n\r\n").as_bytes()).is_ok() {
                let mut bytes = [0; 256];
                if stream.read(&mut bytes).is_ok_and(|n| n > 0 && bytes[..n].starts_with(b"HTTP/1.0 200")) {
                    let console_ready = console.is_none_or(|addr| {
                        TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok_and(|mut stream| {
                            let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
                            stream.read(&mut [0; 256]).is_ok_and(|n| n > 0)
                        })
                    });
                    if console_ready { return Ok(()); }
                }
            }
        }
        if Instant::now() >= deadline { return Err("Container started but its required loopback endpoints did not become healthy.".into()); }
        thread::sleep(Duration::from_millis(100));
    }
}
fn same_flag(expected: &str, supplied: &str) -> bool {
    let mut difference = expected.len() ^ supplied.len();
    for (i, byte) in expected.bytes().enumerate() { difference |= (byte ^ supplied.as_bytes().get(i).copied().unwrap_or(0)) as usize; }
    difference == 0
}
impl LabRuntimeState {
    fn with_executor(executor: Arc<dyn Executor>) -> Self {
        Self { inner: Mutex::new(Inner::default()), operation: Mutex::new(()), startup: Mutex::new(None), stopping: AtomicUsize::new(0), generation: AtomicUsize::new(0), closed: AtomicBool::new(false), executor }
    }
    // shortcut: no durable owner journal exists. A process crash/SIGKILL or
    // daemon work completing after an interrupted client can leave resources,
    // build cache, or a private temporary context; CLI exit is not a daemon receipt.
    // Never guess ownership or adopt/prune an earlier process's resources.
    pub fn persistent() -> Self { Self::default() }
    pub fn start(&self, lab_id: String) -> Result<LabRuntimeStatus, String> {
        self.start_at(lab_id, self.generation.load(Ordering::Acquire))
    }
    fn start_at(&self, lab_id: String, generation: usize) -> Result<LabRuntimeStatus, String> {
        let _operation = self.operation.lock().map_err(|_| "Lab runtime unavailable")?;
        if generation != self.generation.load(Ordering::Acquire) { return Err("Queued lab startup was cancelled by Stop".into()); }
        self.start_locked(lab_id)
    }
    fn start_locked(&self, lab_id: String) -> Result<LabRuntimeStatus, String> {
        if !LAB_IDS.contains(&lab_id.as_str()) { return Err("Unknown practical lab".into()); }
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut startup = self.startup.lock().map_err(|_| "Lab runtime unavailable")?;
            let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
            if self.closed.load(Ordering::Acquire) { return Err("Lab runtime is shutting down".into()); }
            if self.stopping.load(Ordering::Acquire) > 0 { return Ok(inner.status.clone()); }
            if inner.run.is_some() { return Err("Stop the current lab or finish its cleanup before starting another".into()); }
            *startup = Some(cancel.clone());
            inner.status = LabRuntimeStatus { lab_id: Some(lab_id.clone()), phase: "starting", message: "Provisioning the owned local target… Use Stop to cancel.".into(), ..LabRuntimeStatus::default() };
        }
        let host = match check_engine(|host, args| self.executor.docker(host, args, Duration::from_secs(10), &cancel)) {
            Ok(host) => host,
            Err(message) => return self.finish_start(lab_id, None, if cancel.load(Ordering::Acquire) { "stopped" } else { "setup-required" }, message),
        };
        let mut run = match create_run(host, &lab_id) {
            Ok(run) => run,
            Err(message) => return self.finish_start(lab_id, None, "error", message),
        };
        run.executor = self.executor.clone();
        let result = launch(&mut run, &lab_id, &cancel);
        if result.is_ok() && !cancel.load(Ordering::Acquire) {
            return self.finish_start(lab_id, Some(run), "running", "Target ready. Follow the room's clues and submit the recovered value.".into());
        }
        let message = result.err().unwrap_or_else(|| "Lab startup cancelled.".into());
        let clean = cleanup(&mut run);
        self.finish_start(lab_id, if clean { None } else { Some(run) },
            if clean && cancel.load(Ordering::Acquire) { "stopped" } else { "error" },
            if clean { message } else { format!("{message} Owned-resource cleanup remains pending; use Stop after repairing Docker access.") })
    }
    fn finish_start(&self, lab_id: String, run: Option<Run>, phase: &'static str, message: String) -> Result<LabRuntimeStatus, String> {
        self.startup.lock().map_err(|_| "Lab runtime unavailable")?.take();
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        inner.status = LabRuntimeStatus { running: phase == "running", lab_id: Some(lab_id), phase,
            target_url: if phase == "running" { run.as_ref().and_then(|run| run.url.clone()) } else { None },
            console_addr: if phase == "running" { run.as_ref().and_then(|run| run.console.as_ref().map(|console| console.addr.to_string())) } else { None },
            message, ..LabRuntimeStatus::default() };
        inner.run = run;
        Ok(inner.status.clone())
    }
    pub fn status(&self) -> Result<LabRuntimeStatus, String> {
        // IPC calls this on a blocking worker. During another lifecycle action
        // return the short-lived cached snapshot without waiting for its lock.
        let _operation = match self.operation.try_lock() {
            Ok(operation) => operation,
            Err(std::sync::TryLockError::WouldBlock) => return self.snapshot(),
            Err(_) => return Err("Lab runtime unavailable".into()),
        };
        let mut run = {
            let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
            if !inner.status.running { return Ok(inner.status.clone()); }
            inner.run.take().ok_or("No running container lab")?
        };
        let inspection = self.executor.docker(Some(&run.host), &["container", "inspect", "--format", "{{json .}}", &run.container], Duration::from_secs(3), &AtomicBool::new(false));
        let healthy = inspection.ok().and_then(|output| serde_json::from_str::<Value>(&output).ok())
            .is_some_and(|container| container["Config"]["Labels"][OWNER_LABEL] == run.owner && container["State"]["Running"] == true && container["State"]["Health"]["Status"] != "unhealthy")
            && run.forwarder.as_ref().is_some_and(|forwarder| !forwarder.stop.load(Ordering::Acquire))
            && run.console.as_ref().is_none_or(|console| !console.stop.load(Ordering::Acquire));
        if !healthy { run.forwarder.take(); run.console.take(); run.url = None; }
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        if !healthy {
            inner.status.running = false; inner.status.phase = "error"; inner.status.target_url = None; inner.status.console_addr = None;
            inner.status.message = "Target health or ownership could not be confirmed. The local endpoints are closed; use Stop to reconcile owned resources.".into();
        }
        inner.run = Some(run);
        Ok(inner.status.clone())
    }
    fn snapshot(&self) -> Result<LabRuntimeStatus, String> { self.inner.lock().map(|inner| inner.status.clone()).map_err(|_| "Lab runtime unavailable".into()) }
    pub fn request_stop(&self) {
        if let Some(cancel) = self.startup.lock().unwrap_or_else(|p| p.into_inner()).as_ref() { cancel.store(true, Ordering::Release); }
    }
    pub fn stop(&self) -> Result<LabRuntimeStatus, String> {
        self.stopping.fetch_add(1, Ordering::AcqRel);
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.request_stop();
        let result = (|| {
            let _operation = self.operation.lock().map_err(|_| "Lab runtime unavailable")?;
            self.stop_locked()
        })();
        self.stopping.fetch_sub(1, Ordering::AcqRel);
        result
    }
    fn stop_locked(&self) -> Result<LabRuntimeStatus, String> {
        let mut run = {
            let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
            inner.status.running = false; inner.status.phase = "stopping"; inner.status.target_url = None; inner.status.console_addr = None;
            inner.status.completed = false; inner.status.message = "Stopping and reconciling owned target resources…".into();
            inner.run.take()
        };
        if run.as_mut().is_some_and(|run| !cleanup(run)) {
            let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
            inner.status.phase = "error"; inner.status.message = "Owned-resource cleanup is pending. Restore Docker access and use Stop again.".into();
            inner.run = run;
            return Ok(inner.status.clone());
        }
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        inner.status = LabRuntimeStatus::default(); Ok(inner.status.clone())
    }
    pub fn shutdown(&self) {
        self.request_shutdown();
        let _ = self.stop();
    }
    pub fn request_shutdown(&self) {
        self.closed.store(true, Ordering::Release);
        self.request_stop();
    }
    pub fn reset(&self) -> Result<LabRuntimeStatus, String> {
        let generation = self.generation.load(Ordering::Acquire);
        let _operation = self.operation.lock().map_err(|_| "Lab runtime unavailable")?;
        if generation != self.generation.load(Ordering::Acquire) { return Err("Queued lab reset was cancelled by Stop".into()); }
        let lab_id = self.snapshot()?.lab_id.ok_or("No practical lab to reset")?;
        let stopped = self.stop_locked()?;
        if stopped.phase != "stopped" { return Ok(stopped); }
        self.start_locked(lab_id)
    }
    pub fn action(&self, action: Value) -> Result<LabRuntimeStatus, String> {
        self.status()?;
        let _operation = self.operation.lock().map_err(|_| "Lab runtime unavailable")?;
        let mut inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
        Self::submit_locked(&mut inner, action)
    }
    fn submit_locked(inner: &mut Inner, action: Value) -> Result<LabRuntimeStatus, String> {
        let object = action.as_object().ok_or("Expected submit_flag action")?;
        if object.len() != 2 || action["action"] != "submit_flag" { return Err("Only submit_flag with a flag string is supported".into()); }
        let supplied = action["flag"].as_str().filter(|v| v.len() <= 256).ok_or("Flag must be a bounded string")?;
        if !inner.status.running { return Err("No running container lab".into()); }
        let run = inner.run.as_ref().ok_or("No running container lab")?;
        if same_flag(&run.flag, supplied) { inner.status.completed = true; inner.status.message = "Flag verified for this run.".into(); }
        else { inner.status.message = "Flag rejected. Follow the current room's evidence trail.".into(); }
        Ok(inner.status.clone())
    }
    pub fn open(&self) -> Result<LabRuntimeStatus, String> {
        self.status()?;
        let url = {
            let inner = self.inner.lock().map_err(|_| "Lab runtime unavailable")?;
            let run = inner.run.as_ref().ok_or("No running container lab")?;
            let url = inner.status.target_url.as_deref().ok_or("No running container lab")?;
            if !inner.status.running || run.url.as_deref() != Some(url) || !url.starts_with("http://127.0.0.1:") || !url.ends_with('/') { return Err("Only the owned loopback target may be opened".into()); }
            url.to_owned()
        };
        self.executor.open(&url)?;
        self.snapshot()
    }
}
impl Drop for LabRuntimeState {
    fn drop(&mut self) {
        self.request_stop();
        let inner = self.inner.get_mut().unwrap_or_else(|p| p.into_inner());
        if let Some(run) = inner.run.as_mut() { let _ = cleanup(run); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_docker_and_old_versions_require_setup() {
        assert!(check_engine_host(None, |_, _| Err("Docker CLI unavailable".into())).is_err());
        assert!(check_engine_host(None, |_, args| Ok(if args[0] == "context" { "unix:///var/run/docker.sock" } else { "27.5.0" }.into())).unwrap_err().contains("28"));
        assert!(supported_version("28.0.0")); assert!(supported_version("29.1.0")); assert!(!supported_version("unknown"));
        assert!(check_engine_host(None, |host, args| {
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
        for port in [22, 8080, 9001] { assert!(Forwarder::start(SocketAddr::from(([172, 22, 0, 2], port))).is_err()); }
        let console = Forwarder::start("172.22.0.2:9000".parse().unwrap()).unwrap();
        assert_eq!(console.addr.ip(), std::net::IpAddr::V4(Ipv4Addr::LOCALHOST));
    }
    #[test]
    fn sandbox_args_and_flag_comparison() {
        let mut run = create_run("unix:///var/run/docker.sock".into(), "web-exposure").unwrap();
        let args = run_args(&run);
        for required in ["--read-only", "--cap-drop", "ALL", "no-new-privileges:true", "--memory", "--pids-limit", "--cpus", "10001:10001"] { assert!(args.iter().any(|arg| arg == required)); }
        for forbidden in ["--privileged", "--volume", "--mount", "--network=host", "--publish", "-p", "-P"] { assert!(!args.iter().any(|arg| arg == forbidden)); }
        assert!(same_flag(&run.flag, &run.flag)); assert!(!same_flag(&run.flag, "wrong")); assert!(!same_flag(&run.flag, &(run.flag.clone() + "x")));
        let next = create_run(run.host.clone(), "web-exposure").unwrap(); assert_ne!(next.flag, run.flag); assert_ne!(next.owner, run.owner);
        fs::remove_dir_all(&next.context).unwrap(); assert!(cleanup(&mut run));
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
        let mut run = create_run("unix:///var/run/docker.sock".into(), "web-exposure").unwrap();
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

    #[test]
    #[ignore = "Requires Docker >=28; verifies every provisioned room can start"]
    fn docker_all_available_rooms_start_and_stop() {
        for lab_id in LAB_IDS {
            let state = LabRuntimeState::default();
            let status = state.start((*lab_id).into()).unwrap();
            assert!(status.running, "{lab_id}: {}", status.message);
            assert_eq!(status.lab_id.as_deref(), Some(*lab_id));
            assert!(status.target_url.as_deref().is_some_and(|url| url.starts_with("http://127.0.0.1:")));
            let old_flag = state.inner.lock().unwrap().run.as_ref().unwrap().flag.clone();
            let old_console = status.console_addr.as_deref().map(|addr| {
                let mut stream = TcpStream::connect(addr).unwrap();
                stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                assert!(stream.read(&mut [0; 256]).unwrap() > 0);
                stream.write_all(b"HELP\n").unwrap();
                assert!(stream.read(&mut [0; 256]).unwrap() > 0);
                stream
            });
            assert_eq!(status.console_addr.is_some(), has_console(lab_id));
            let reset = state.reset().unwrap();
            assert!(reset.running, "{lab_id}: {}", reset.message);
            assert_eq!(reset.lab_id.as_deref(), Some(*lab_id));
            assert!(!state.action(serde_json::json!({"action":"submit_flag","flag":old_flag})).unwrap().completed);
            let next_flag = state.inner.lock().unwrap().run.as_ref().unwrap().flag.clone();
            assert_ne!(old_flag, next_flag);
            assert!(state.action(serde_json::json!({"action":"submit_flag","flag":next_flag})).unwrap().completed);
            if let Some(mut console) = old_console {
                match console.read(&mut [0; 1]) {
                    Ok(0) => {},
                    Err(error) if matches!(error.kind(), std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted) => {},
                    other => panic!("Reset did not close the previous console: {other:?}"),
                }
            }
            let mut next_console = reset.console_addr.as_ref().map(|addr| {
                let mut stream = TcpStream::connect(addr).unwrap();
                stream.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
                assert!(stream.read(&mut [0; 256]).unwrap() > 0);
                stream
            });
            assert_eq!(state.stop().unwrap().phase, "stopped");
            if let Some(console) = next_console.as_mut() {
                match console.read(&mut [0; 1]) {
                    Ok(0) => {},
                    Err(error) if matches!(error.kind(), std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted) => {},
                    other => panic!("Stop did not close the console: {other:?}"),
                }
            }
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
#[path = "lab_runtime_lifecycle_tests.rs"]
mod lifecycle_tests;
