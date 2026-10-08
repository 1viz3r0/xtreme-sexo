use netoze_desktop::services::lab_runtime::LabRuntimeState;
use serde_json::json;

fn get_json(url: &str, path: &str) -> serde_json::Value {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;
    let authority = url.strip_prefix("http://").unwrap().trim_end_matches('/');
    assert!(authority.starts_with("127.0.0.1:"));
    let mut stream = TcpStream::connect(authority).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    stream.set_write_timeout(Some(Duration::from_secs(3))).unwrap();
    write!(stream, "GET {path} HTTP/1.0\r\nHost: {authority}\r\nConnection: close\r\n\r\n").unwrap();
    let mut response = String::new();
    stream.take(64 * 1024).read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.0 200"));
    serde_json::from_str(response.split_once("\r\n\r\n").unwrap().1).unwrap()
}
fn discover_flag(url: &str) -> String {
    let release = get_json(url, "/api/releases");
    let path = format!("{}{}", release["export_directory"].as_str().unwrap(), release["config_backup"].as_str().unwrap());
    get_json(url, &path)["flag"].as_str().unwrap().to_owned()
}

#[test]
fn stopped_contract_and_actions_have_no_legacy_engine_or_flag_leakage() {
    let state = LabRuntimeState::default();
    let status = serde_json::to_value(state.status().unwrap()).unwrap();
    assert_eq!(status, json!({"running":false,"labId":null,"phase":"stopped","targetUrl":null,"message":"No practical lab is running.","runtime":"docker","completed":false}));
    assert!(state.start("red-network-discovery".into()).is_err());
    assert!(state.start("ctf-web-inventory".into()).is_err());
    assert!(state.action(json!({"action":"execute","command":"id"})).is_err());
    assert!(state.action(json!({"action":"submit_flag","flag":"NET0ZE{fake}"})).is_err());
    assert!(state.reset().is_err()); assert!(state.open().is_err());
    assert_eq!(serde_json::to_value(state.stop().unwrap()).unwrap(), status);
}

#[test]
fn missing_cli_reports_setup_required_instead_of_a_running_target() {
    // Deterministic setup validation is also covered by private engine-probe
    // unit tests. This integration check runs where Docker is actually absent.
    if std::process::Command::new("docker").arg("--version").output().is_ok() { return; }
    let state = LabRuntimeState::default();
    let status = state.start("web-exposure".into()).unwrap();
    assert_eq!(status.phase, "setup-required"); assert!(!status.running);
    assert_eq!(status.lab_id.as_deref(), Some("web-exposure"));
    assert!(status.target_url.is_none()); assert!(!status.completed);
    assert_eq!(status.runtime, "docker"); assert!(status.message.contains("Docker"));
    assert_eq!(serde_json::to_value(state.status().unwrap()).unwrap(), serde_json::to_value(status).unwrap());
    assert!(state.action(json!({"action":"submit_flag","flag":"NET0ZE{fake}"})).is_err());
}

#[test]
#[ignore = "Requires local Docker >=28, daemon, and Python base image; real container acceptance"]
fn docker_target_lifecycle_is_real_and_loopback_only() {
    use std::io::{Read, Write};
    fn stalled(url: &str) -> std::net::TcpStream {
        let mut stream = std::net::TcpStream::connect(url.strip_prefix("http://").unwrap().trim_end_matches('/')).unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(1))).unwrap();
        stream.write_all(b"GET /health HTTP/1.1\r\n").unwrap();
        stream
    }
    fn closed(stream: &mut std::net::TcpStream) {
        match stream.read(&mut [0; 1]) {
            Ok(0) => {},
            Err(error) if matches!(error.kind(), std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted) => {},
            other => panic!("Owned proxy connection was not cancelled: {other:?}"),
        }
    }
    let state = LabRuntimeState::default();
    let status = state.start("web-exposure".into()).unwrap();
    assert!(status.running, "{}: {}", status.phase, status.message);
    assert_eq!(status.phase, "running"); assert_eq!(status.runtime, "docker");
    assert!(status.target_url.as_ref().unwrap().starts_with("http://127.0.0.1:"));
    assert!(!serde_json::to_string(&status).unwrap().contains("NET0ZE{"));
    let flag = discover_flag(status.target_url.as_ref().unwrap());
    assert!(state.action(json!({"action":"submit_flag","flag":flag})).unwrap().completed);
    assert!(!serde_json::to_string(&state.status().unwrap()).unwrap().contains("NET0ZE{"));
    let mut pending_reset = stalled(status.target_url.as_ref().unwrap());
    let reset = state.reset().unwrap(); assert!(reset.running, "{}", reset.message);
    closed(&mut pending_reset);
    assert!(!reset.completed); assert!(reset.target_url.is_some());
    let next_flag = discover_flag(reset.target_url.as_ref().unwrap());
    assert_ne!(flag, next_flag);
    assert!(!state.action(json!({"action":"submit_flag","flag":flag})).unwrap().completed);
    assert!(state.action(json!({"action":"submit_flag","flag":next_flag})).unwrap().completed);
    let url = reset.target_url.unwrap();
    let mut pending_stop = stalled(&url);
    assert!(!state.stop().unwrap().running);
    closed(&mut pending_stop);
    assert!(std::net::TcpStream::connect(url.strip_prefix("http://").unwrap().trim_end_matches('/')).is_err());

    let final_run = state.start("web-exposure".into()).unwrap();
    assert!(final_run.running, "{}", final_run.message);
    let mut pending_drop = stalled(final_run.target_url.as_ref().unwrap());
    drop(state);
    closed(&mut pending_drop);
    assert!(std::net::TcpStream::connect(final_run.target_url.unwrap().strip_prefix("http://").unwrap().trim_end_matches('/')).is_err());
}
