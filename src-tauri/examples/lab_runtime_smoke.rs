//! Manual Docker-only native smoke runner. Requires a local Docker >=28 daemon.
//! Emits the shared status contract; stdin commands: status, reset, stop.
#[path = "../src/services/lab_runtime.rs"]
#[allow(dead_code)]
mod lab_runtime;
use lab_runtime::LabRuntimeState;
use std::io::{self, BufRead, Read, Write};

fn emit(value: impl serde::Serialize) -> io::Result<()> {
    let mut out = io::stdout().lock();
    serde_json::to_writer(&mut out, &value)?;
    writeln!(out)?;
    out.flush()
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.len() > 1 || args.first().is_some_and(|arg| arg != "web-exposure") { return Err("usage: lab_runtime_smoke [web-exposure]".into()); }
    let runtime = LabRuntimeState::default();
    emit(runtime.start("web-exposure".into())?)?;
    let mut input = io::stdin().lock();
    loop {
        let mut bytes = Vec::new();
        let n = input.by_ref().take(65).read_until(b'\n', &mut bytes)?;
        if n == 0 { runtime.stop()?; break; }
        if bytes.len() > 64 { runtime.stop()?; return Err("control input exceeds 64 bytes".into()); }
        let command = std::str::from_utf8(&bytes)?.trim();
        let status = match command { "status" => runtime.status(), "reset" => runtime.reset(), "stop" => runtime.stop(), _ => { emit(serde_json::json!({"error":"expected status, reset or stop"}))?; continue; } };
        emit(status?)?;
        if command == "stop" { break; }
    }
    Ok(())
}
