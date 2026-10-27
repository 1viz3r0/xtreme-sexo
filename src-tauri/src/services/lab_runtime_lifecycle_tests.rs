//! Controlled Docker transport tests, not real-container/sandbox acceptance.
use super::*;
use std::collections::BTreeMap;
use std::sync::mpsc;

#[derive(Default)]
struct Model {
    resources: BTreeMap<(String, String), (String, String)>,
    calls: Vec<Vec<String>>,
    network: String,
}
#[derive(Default)]
struct Controlled {
    model: Mutex<Model>,
    block: Option<&'static str>,
    entered: Mutex<Option<mpsc::Sender<()>>>,
    unavailable: AtomicBool,
    dead: AtomicBool,
    fail: AtomicBool,
    open_wait: Mutex<Option<mpsc::Receiver<()>>>,
}
impl Controlled {
    fn blocking(phase: &'static str) -> (Arc<Self>, mpsc::Receiver<()>) {
        let (send, receive) = mpsc::channel();
        (Arc::new(Self { block: Some(phase), entered: Mutex::new(Some(send)), ..Self::default() }), receive)
    }
    fn step(&self, phase: &str, cancel: &AtomicBool) -> Result<(), String> {
        if self.block == Some(phase) {
            if let Some(send) = self.entered.lock().unwrap().take() { let _ = send.send(()); }
            let deadline = Instant::now() + Duration::from_secs(3);
            while !cancel.load(Ordering::Acquire) && Instant::now() < deadline { thread::sleep(Duration::from_millis(2)); }
            return Err("Controlled interrupted startup".into());
        }
        if cancel.load(Ordering::Acquire) { return Err("Controlled cancellation".into()); }
        Ok(())
    }
}
impl Executor for Controlled {
    fn docker(&self, _: Option<&str>, args: &[&str], _: Duration, cancel: &AtomicBool) -> Result<String, String> {
        if self.unavailable.load(Ordering::Acquire) { return Err("Controlled daemon unavailable".into()); }
        self.model.lock().unwrap().calls.push(args.iter().map(|arg| (*arg).into()).collect());
        let value = |key| args.windows(2).find(|pair| pair[0] == key).map(|pair| pair[1]).unwrap_or("");
        if matches!(args[0], "context" | "version" | "info") { self.step("engine", cancel)?; }
        if args[0] == "context" { return Ok("unix:///controlled/docker.sock".into()); }
        if args[0] == "version" { return Ok("28.5.2".into()); }
        if args[0] == "info" { return Ok("linux|Controlled native Linux|[]".into()); }
        let kind = if args[0] == "build" { "image" } else if args[0] == "create" { "container" } else { args[0] };
        let creation = args[0] == "build" || args[0] == "create" || args.get(1) == Some(&"create");
        if creation {
            let name = if kind == "image" { value("--tag") } else if kind == "container" { value("--name") } else { args.last().unwrap() };
            let owner = value("--label").split_once('=').unwrap().1;
            let id = match kind { "container" => "c", "network" => "b", _ => "a" }.repeat(64);
            {
                let mut model = self.model.lock().unwrap();
                model.resources.insert((kind.into(), name.into()), (id, owner.into()));
                if kind == "network" { model.network = name.into(); }
            }
            self.step(if kind == "image" { "build" } else { kind }, cancel)?;
            if self.fail.load(Ordering::Acquire) { return Err("Controlled ambiguous creation failure".into()); }
            return Ok(String::new());
        }
        self.step("operation", cancel)?;
        let mut model = self.model.lock().unwrap();
        if args.get(1) == Some(&"start") { return Ok(String::new()); }
        if args.get(1) == Some(&"rm") {
            let id = *args.last().unwrap();
            assert_eq!(id.trim_start_matches("sha256:").len(), 64, "cleanup must remove an inspected ID");
            model.resources.retain(|(resource, _), (resource_id, _)| resource != kind || resource_id != id);
            return Ok(String::new());
        }
        if args.get(1) == Some(&"ls") {
            let owner = value("--filter").rsplit('=').next().unwrap();
            return Ok(model.resources.iter().filter(|((resource, _), (_, label))| resource == kind && label == owner).map(|(_, (id, _))| id.clone()).collect::<Vec<_>>().join("\n"));
        }
        if args.get(1) == Some(&"inspect") {
            let name = *args.last().unwrap();
            let (_, (id, owner)) = model.resources.iter().find(|((resource, resource_name), (id, _))| resource == kind && (resource_name == name || id == name)).ok_or("Controlled missing resource")?;
            if value("--format") == "{{.Internal}}" { return Ok("true".into()); }
            if value("--format") != "{{json .}}" { return Ok(format!("{id} {owner}")); }
            let network_id = "b".repeat(64); let container_id = "c".repeat(64);
            return Ok(if kind == "container" {
                serde_json::json!({"Id":id,"Config":{"Labels":{OWNER_LABEL:owner}},"State":{"Running":!self.dead.load(Ordering::Acquire)},"NetworkSettings":{"Networks":{&model.network:{"NetworkID":network_id,"IPAddress":"172.22.0.2"}}}})
            } else {
                serde_json::json!({"Id":id,"Name":model.network,"Internal":true,"Labels":{OWNER_LABEL:owner},"IPAM":{"Config":[{"Subnet":"172.22.0.0/16","Gateway":"172.22.0.1"}]},"Containers":{container_id:{"IPv4Address":"172.22.0.2/16"}}})
            }.to_string());
        }
        Err("Unexpected controlled Docker operation".into())
    }
    fn ready(&self, _: SocketAddr, _: Option<SocketAddr>, cancel: &AtomicBool) -> Result<(), String> { self.step("ready", cancel) }
    fn open(&self, _: &str) -> Result<(), String> {
        if let Some(send) = self.entered.lock().unwrap().take() { let _ = send.send(()); }
        if let Some(wait) = self.open_wait.lock().unwrap().take() { wait.recv_timeout(Duration::from_secs(2)).map_err(|_| "Controlled opener timeout")?; }
        Ok(())
    }
}

#[test]
fn cancellation_at_each_creation_boundary_cleans_ambiguous_owned_resources() {
    for phase in ["engine", "build", "network", "container", "ready"] {
        let (executor, entered) = Controlled::blocking(phase);
        let state = Arc::new(LabRuntimeState::with_executor(executor.clone()));
        let runtime = state.clone();
        let start = thread::spawn(move || runtime.start("header-trail".into()).unwrap());
        entered.recv_timeout(Duration::from_secs(2)).unwrap();
        let before = Instant::now();
        assert_eq!(state.status().unwrap().phase, "starting");
        assert!(before.elapsed() < Duration::from_millis(200));
        assert_eq!(state.stop().unwrap().phase, "stopped");
        assert!(!start.join().unwrap().running);
        let model = executor.model.lock().unwrap();
        assert!(model.resources.is_empty(), "{phase}: {:?}", model.resources);
        if let Some(build) = model.calls.iter().find(|args| args[0] == "build") { assert!(!std::path::Path::new(build.last().unwrap()).exists()); }
        else { assert_eq!(phase, "engine"); }
    }
}

#[test]
fn same_room_reset_rotates_flags_and_only_console_rooms_get_tcp_ingress() {
    for lab_id in LAB_IDS {
        let executor = Arc::new(Controlled::default());
        let state = LabRuntimeState::with_executor(executor.clone());
        let initial = state.start((*lab_id).into()).unwrap();
        assert!(initial.running, "{}", initial.message);
        assert_eq!(initial.console_addr.is_some(), has_console(lab_id));
        let old_flag = state.inner.lock().unwrap().run.as_ref().unwrap().flag.clone();
        assert!(state.action(serde_json::json!({"action":"submit_flag","flag":old_flag})).unwrap().completed);
        let reset = state.reset().unwrap();
        assert_eq!(reset.lab_id.as_deref(), Some(*lab_id)); assert!(reset.running); assert!(!reset.completed);
        assert!(!state.action(serde_json::json!({"action":"submit_flag","flag":old_flag})).unwrap().completed);
        let new_flag = state.inner.lock().unwrap().run.as_ref().unwrap().flag.clone();
        assert_ne!(new_flag, old_flag);
        assert!(state.action(serde_json::json!({"action":"submit_flag","flag":new_flag})).unwrap().completed);
        assert_eq!(state.stop().unwrap().phase, "stopped");
        assert!(executor.model.lock().unwrap().resources.is_empty());
    }
}

#[test]
fn target_death_closes_both_endpoints_and_rejects_submission() {
    let executor = Arc::new(Controlled::default());
    let state = LabRuntimeState::with_executor(executor.clone());
    let running = state.start("header-trail".into()).unwrap();
    let flag = state.inner.lock().unwrap().run.as_ref().unwrap().flag.clone();
    executor.dead.store(true, Ordering::Release);
    let status = state.status().unwrap();
    assert_eq!(status.phase, "error"); assert!(!status.running);
    assert!(status.target_url.is_none()); assert!(status.console_addr.is_none());
    assert!(TcpStream::connect(running.target_url.unwrap().trim_start_matches("http://").trim_end_matches('/')).is_err());
    assert!(TcpStream::connect(running.console_addr.unwrap()).is_err());
    assert!(state.action(serde_json::json!({"action":"submit_flag","flag":flag})).is_err());
    assert_eq!(state.stop().unwrap().phase, "stopped");
}

#[test]
fn failed_creation_and_unavailable_cleanup_retain_owner_until_retry() {
    let (executor, entered) = Controlled::blocking("build");
    let state = Arc::new(LabRuntimeState::with_executor(executor.clone()));
    let runtime = state.clone(); let start = thread::spawn(move || runtime.start("first-contact".into()).unwrap());
    entered.recv_timeout(Duration::from_secs(2)).unwrap();
    executor.unavailable.store(true, Ordering::Release);
    assert_eq!(state.stop().unwrap().phase, "error");
    assert_eq!(start.join().unwrap().phase, "error");
    assert!(state.start("web-exposure".into()).is_err());
    assert!(!executor.model.lock().unwrap().resources.is_empty());
    executor.unavailable.store(false, Ordering::Release);
    assert_eq!(state.stop().unwrap().phase, "stopped");
    assert!(executor.model.lock().unwrap().resources.is_empty());
}

#[test]
fn failed_build_cleans_attempted_image_and_private_context() {
    let executor = Arc::new(Controlled::default());
    executor.fail.store(true, Ordering::Release);
    let state = LabRuntimeState::with_executor(executor.clone());
    assert_eq!(state.start("first-contact".into()).unwrap().phase, "error");
    let model = executor.model.lock().unwrap();
    assert!(model.resources.is_empty());
    assert!(!std::path::Path::new(model.calls.iter().find(|args| args[0] == "build").unwrap().last().unwrap()).exists());
    assert!(state.inner.lock().unwrap().run.is_none());
}

#[test]
fn shutdown_cancels_startup_and_refuses_late_queued_starts() {
    let (executor, entered) = Controlled::blocking("build");
    let state = Arc::new(LabRuntimeState::with_executor(executor.clone()));
    let runtime = state.clone(); let start = thread::spawn(move || runtime.start("first-contact".into()).unwrap());
    entered.recv_timeout(Duration::from_secs(2)).unwrap();
    state.shutdown();
    assert!(!start.join().unwrap().running);
    assert!(state.start("web-exposure".into()).unwrap_err().contains("shutting down"));
    assert!(executor.model.lock().unwrap().resources.is_empty());
}

#[test]
fn stop_invalidates_previously_queued_starts_but_allows_a_new_explicit_start() {
    let executor = Arc::new(Controlled::default());
    let state = LabRuntimeState::with_executor(executor.clone());
    let queued_generation = state.generation.load(Ordering::Acquire);
    assert!(state.start("first-contact".into()).unwrap().running);
    assert!(state.start("web-exposure".into()).is_err());
    state.stop().unwrap();
    assert!(state.start_at("web-exposure".into(), queued_generation).unwrap_err().contains("cancelled"));
    assert!(executor.model.lock().unwrap().resources.is_empty());
    assert!(state.start("first-contact".into()).unwrap().running);
    state.stop().unwrap();
}

#[test]
fn opener_releases_runtime_lock_before_waiting() {
    let (send, entered) = mpsc::channel(); let (release, wait) = mpsc::channel();
    let executor = Arc::new(Controlled { entered: Mutex::new(Some(send)), open_wait: Mutex::new(Some(wait)), ..Controlled::default() });
    let state = Arc::new(LabRuntimeState::with_executor(executor));
    assert!(state.start("first-contact".into()).unwrap().running);
    let runtime = state.clone(); let open = thread::spawn(move || runtime.open());
    entered.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(state.stop().unwrap().phase, "stopped");
    release.send(()).unwrap(); assert_eq!(open.join().unwrap().unwrap().phase, "stopped");
}

#[test]
fn foreign_resources_and_crash_orphans_are_never_adopted_or_deleted() {
    let executor = Arc::new(Controlled::default());
    let mut run = create_run("unix:///controlled/docker.sock".into(), "web-exposure").unwrap();
    run.executor = executor.clone(); run.container_created = true;
    executor.model.lock().unwrap().resources.insert(("container".into(), run.container.clone()), ("f".repeat(64), "foreign-owner".into()));
    assert!(cleanup(&mut run));
    executor.model.lock().unwrap().resources.insert(("network".into(), format!("netoze-network-{}", "e".repeat(48))), ("d".repeat(64), "e".repeat(48)));
    let restarted = LabRuntimeState::with_executor(executor.clone());
    assert_eq!(restarted.status().unwrap().phase, "stopped");
    restarted.shutdown();
    assert_eq!(executor.model.lock().unwrap().resources.len(), 2);
    assert!(!executor.model.lock().unwrap().calls.iter().any(|args| args.get(1).is_some_and(|arg| arg == "rm")));
}

#[test]
fn builder_environment_is_bound_to_validated_local_host() {
    let command = docker_command(Some("unix:///controlled/docker.sock"), &["build", "--network", "none", "."]);
    let env = command.get_envs().map(|(key, value)| (key.to_string_lossy().into_owned(), value.map(|value| value.to_string_lossy().into_owned()))).collect::<BTreeMap<_, _>>();
    assert_eq!(env["BUILDX_BUILDER"].as_deref(), Some("default"));
    assert_eq!(env["BUILDKIT_HOST"], None); assert_eq!(env["DOCKER_CONTEXT"], None);
    assert_eq!(command.get_args().next().unwrap(), "--host");
    assert!(!docker_command(None, &["context", "inspect"]).get_envs().any(|(key, _)| key == "DOCKER_CONTEXT"), "local context metadata discovery must honor the selected context");
    for dockerfile in [DOCKERFILE, NETWORK_DOCKERFILE, LINUX_DOCKERFILE, HEADER_DOCKERFILE, PROTOCOL_DOCKERFILE, FIRST_CONTACT_DOCKERFILE, SERVICE_SIGNALS_DOCKERFILE] {
        assert_eq!(dockerfile.lines().next(), DOCKERFILE.lines().next());
        assert!(dockerfile.lines().next().unwrap().contains("@sha256:"));
    }
}

#[test]
fn incompatible_engines_are_rejected_before_any_provisioning() {
    for platform in ["linux|Docker Desktop|[]", "linux|Native Linux|[\"name=rootless\"]", "windows|Windows|[]"] {
        assert!(check_engine_host(None, |_, args| Ok(match args[0] { "context" => "unix:///controlled/docker.sock", "info" => platform, _ => "28.5.2" }.into())).is_err());
    }
    let mut calls = Vec::new();
    assert!(check_engine_host(None, |_, args| { calls.push(args[0].to_owned()); Ok("tcp://example.invalid:2375".into()) }).is_err());
    assert_eq!(calls, ["context"]);
    assert!(check_engine_host(Some("ssh://example.invalid".into()), |_, _| panic!("remote endpoints must be rejected without dispatch")).is_err());
}

#[test]
fn both_cli_and_server_versions_are_checked_on_the_validated_host() {
    for (client, server, supported) in [("27.5.0", "28.5.2", false), ("28.5.2", "27.5.0", false), ("unknown", "28.5.2", false), ("28.5.2", "29.1.0", true)] {
        let result = check_engine_host(Some("unix:///controlled/docker.sock".into()), |host, args| {
            assert_eq!(host, Some("unix:///controlled/docker.sock"));
            Ok(if args[0] == "info" { "linux|Controlled Linux|[]" } else if args[2].contains("Client") { client } else { server }.into())
        });
        assert_eq!(result.is_ok(), supported, "client={client} server={server}");
    }
}

#[test]
fn process_fixture() {
    match std::env::var("NETOZE_LAB_PROCESS_FIXTURE").as_deref() {
        Ok("wait") => thread::sleep(Duration::from_secs(30)),
        Ok("output") => { std::io::stdout().write_all(&vec![b'x'; 2 * OUTPUT_LIMIT as usize]).unwrap(); },
        Ok("failure") => panic!("Controlled executable failure"),
        Ok("parent") => {
            let mut child = fixture("socket").stdout(Stdio::inherit()).spawn().unwrap();
            let _ = child.wait();
        },
        Ok("socket") => {
            let _stream = TcpStream::connect(std::env::var("NETOZE_LAB_FIXTURE_ADDR").unwrap()).unwrap();
            thread::sleep(Duration::from_secs(30));
        },
        Ok("background") => { fixture("background-socket").stdout(Stdio::inherit()).spawn().unwrap(); },
        Ok("background-socket") => {
            let mut stream = TcpStream::connect(std::env::var("NETOZE_LAB_FIXTURE_ADDR").unwrap()).unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let _ = stream.read(&mut [0; 1]);
        },
        _ => {},
    }
}
fn fixture(mode: &str) -> Command {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.args(["--exact", "services::lab_runtime::lifecycle_tests::process_fixture", "--nocapture"])
        .env("NETOZE_LAB_PROCESS_FIXTURE", mode);
    command
}
#[test]
fn local_process_timeout_cancellation_and_output_cap_are_real() {
    let output = run_command(fixture("output"), Duration::from_secs(3), &AtomicBool::new(false)).unwrap();
    assert_eq!(output.len(), OUTPUT_LIMIT as usize);
    assert!(run_command(fixture("failure"), Duration::from_secs(1), &AtomicBool::new(false)).unwrap_err().contains("failed"));
    let before = Instant::now();
    assert!(run_command(fixture("wait"), Duration::from_millis(75), &AtomicBool::new(false)).unwrap_err().contains("timed out"));
    assert!(before.elapsed() < Duration::from_secs(2));
    let cancel = Arc::new(AtomicBool::new(false)); let signal = cancel.clone();
    let timer = thread::spawn(move || { thread::sleep(Duration::from_millis(50)); signal.store(true, Ordering::Release); });
    assert!(run_command(fixture("wait"), Duration::from_secs(5), &cancel).unwrap_err().contains("cancelled"));
    timer.join().unwrap();
}

#[cfg(unix)]
#[test]
fn timeout_closes_inherited_stdout_plugin_and_its_connection() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let mut command = fixture("parent");
    command.env("NETOZE_LAB_FIXTURE_ADDR", listener.local_addr().unwrap().to_string());
    let worker = thread::spawn(move || run_command(command, Duration::from_secs(1), &AtomicBool::new(false)));
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut stream = loop {
        match listener.accept() {
            Ok((stream, _)) => break stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
            other => panic!("Fixture plugin did not connect: {other:?}"),
        }
    };
    stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    assert_eq!(stream.read(&mut [0; 1]).unwrap(), 0, "owned process-group descendant must exit too");
    assert!(worker.join().unwrap().unwrap_err().contains("timed out"));
}

#[test]
fn successful_url_launcher_does_not_wait_for_or_kill_its_background_browser() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let mut command = fixture("background");
    command.env("NETOZE_LAB_FIXTURE_ADDR", listener.local_addr().unwrap().to_string());
    assert!(run_command_output(command, Duration::from_secs(1), &AtomicBool::new(false), false).is_ok());
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match listener.accept() {
            Ok((stream, _)) => { drop(stream); break; },
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
            other => panic!("Successfully launched background browser was not preserved: {other:?}"),
        }
    }
}
