//! Native Capture Buddy orchestration. libpcap/Npcap supplies adapter access only.
use crate::services::{buddy_engine as engine, buddy_search};
use crate::services::capture_brief::InvestigationBrief;
use serde::Serialize;
use std::{collections::HashMap, io::{Read,Write}, path::{Path,PathBuf}, sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}}, time::{Duration,Instant}};
use tauri::State;

#[derive(Default)]
pub struct BuddyState { sessions: Mutex<HashMap<String,Session>> }
struct Session { path:PathBuf, worker:Option<Worker>, error:Arc<Mutex<Option<String>>> }
struct Worker { stop:Arc<AtomicBool>, thread:std::thread::JoinHandle<()> }
const HELPER_PATH:&str="/usr/lib/netoze/netoze-capture-helper";
#[derive(Serialize)]
pub struct BuddyStatus { pub session_id:String,pub path:String,pub running:bool,pub bytes:u64 }
#[derive(Serialize)]
pub struct EngineStatus { pub available:bool,pub engine:String,pub detail:String,pub live_capture_blocked:bool,pub capture_guidance:Option<String> }
#[derive(Serialize)]
pub struct PacketRow { pub number:u64,pub time:String,pub source:String,pub destination:String,pub protocol:String,pub length:String,pub info:String }
#[derive(Serialize)]
pub struct PacketPage {pub packets:Vec<PacketRow>,pub has_more:bool}
#[derive(Serialize)]
pub struct SearchPage {pub packets:Vec<PacketRow>,pub has_more:bool,pub translated_filter:String}
#[derive(Serialize)]
pub struct PacketDetail {pub number:u64,pub dissection:String}
#[derive(Serialize)]
pub struct SavedRecording {pub path:String,pub bytes:u64}
static READ_SLOTS:tokio::sync::Semaphore=tokio::sync::Semaphore::const_new(2);
const RESTRICTED_GUIDANCE:&str="CAPTURE_RESTRICTED: This launch environment blocks packet-capture privileges (NoNewPrivs). Launch NET0ZE from your desktop menu; if still restricted, ask the administrator to review the launch policy. Saved captures remain available.";

#[cfg(target_os="linux")]
fn helper_access()->Result<(),String>{
    use std::os::unix::fs::MetadataExt;
    use std::process::{Command,Stdio};
    let metadata=std::fs::metadata(HELPER_PATH).map_err(|_|"CAPTURE_SETUP: Install the new NET0ZE DEB with your system package manager. The previous per-user installation has no privileged native capture helper.".to_string())?;
    if !metadata.is_file()||metadata.uid()!=0||metadata.mode()&0o022!=0{return Err("CAPTURE_SETUP: The capture helper must be root-owned and not writable by ordinary users. Reinstall the NET0ZE DEB.".into());}
    let mut child=Command::new(HELPER_PATH).arg("--check").env_clear().stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        .map_err(|e|format!("CAPTURE_SETUP: Cannot access the native helper ({e}). Check that your login belongs to the netdev group; group changes require signing out and back in."))?;
    let deadline=Instant::now()+Duration::from_secs(2);
    loop {
        if child.try_wait().map_err(|e|e.to_string())?.is_some(){break;}
        if Instant::now()>deadline{let _=child.kill();let _=child.wait();return Err("CAPTURE_SETUP: Capture helper check timed out.".into());}
        std::thread::sleep(Duration::from_millis(10));
    }
    let mut response=String::new();if let Some(stdout)=child.stdout.take(){stdout.take(256).read_to_string(&mut response).map_err(|e|e.to_string())?;}
    if response.trim()=="NETOZE_CAPTURE_V1 net_raw=1 restricted=0"||response.trim()=="NETOZE_CAPTURE_V1 net_raw=1 restricted=1"{Ok(())}
    else{Err("CAPTURE_SETUP: Native helper has no CAP_NET_RAW capability. Reinstall the NET0ZE DEB through the system package manager; do not run the desktop GUI as root.".into())}
}
fn capture_access()->Result<(),String>{
    if launch_blocks_capture(){return Err(RESTRICTED_GUIDANCE.into());}
    #[cfg(target_os="linux")] {helper_access()}
    #[cfg(not(target_os="linux"))] {Ok(())}
}

fn restricted_launch(status:&str)->bool {
    let restricted=status.lines().find_map(|s|s.strip_prefix("NoNewPrivs:")).map(str::trim)==Some("1");
    let caps=status.lines().find_map(|s|s.strip_prefix("CapEff:")).and_then(|s|u64::from_str_radix(s.trim(),16).ok());
    restricted&&caps.map(|n|n&(1<<13)==0).unwrap_or(false)
}
fn launch_blocks_capture()->bool {
    #[cfg(target_os="linux")] {std::fs::read_to_string("/proc/self/status").map(|s|restricted_launch(&s)).unwrap_or(false)}
    #[cfg(not(target_os="linux"))] {false}
}
fn duration_arg(seconds:u32)->Result<Duration,String>{if !(1..=3600).contains(&seconds){Err("Choose a whole-number duration from 1 to 3600 seconds.".into())}else{Ok(Duration::from_secs(seconds as u64))}}
fn id()->String {format!("buddy-{}",chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default())}
fn status(session_id:String,s:&Session)->BuddyStatus {BuddyStatus{session_id,path:s.path.display().to_string(),running:s.worker.as_ref().map(|w|!w.thread.is_finished()).unwrap_or(false),bytes:std::fs::metadata(&s.path).map(|m|m.len()).unwrap_or(0)}}

#[tauri::command]
pub fn buddy_engine_status()->EngineStatus {
    let access=capture_access();
    EngineStatus{available:true,engine:"Capture Buddy Native".into(),detail:"Capture Buddy Native 1.0 · Rust file reader, protocol decoder, search and analysis · libpcap/Npcap adapter access".into(),live_capture_blocked:access.is_err(),capture_guidance:access.err()}
}
#[tauri::command]
pub fn buddy_interfaces()->Result<Vec<String>,String>{Ok(pcap::Device::list().map_err(|e|e.to_string())?.into_iter().enumerate().map(|(i,d)|format!("{}. {}{}",i+1,d.name,d.desc.map(|s|format!(" ({s})")).unwrap_or_default())).collect())}

fn load_file(path:&Path,growing:bool)->Result<Vec<engine::Packet>,String>{
    let input=std::fs::File::open(path).map_err(|e|format!("Cannot read capture: {e}"))?;
    let meta=input.metadata().map_err(|e|e.to_string())?;
    if !meta.is_file()||meta.len()>engine::MAX_BYTES as u64{return Err("Select a regular capture file up to 64 MiB".into());}
    let mut bytes=Vec::new();input.take(engine::MAX_BYTES as u64+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    Ok(engine::analyze(engine::read_capture(&bytes,growing)?))
}
fn location(state:&BuddyState,session_id:&str)->Result<(PathBuf,bool),String>{let map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;let s=map.get(session_id).ok_or("Capture session not found")?;Ok((s.path.clone(),s.worker.as_ref().map(|w|!w.thread.is_finished()).unwrap_or(false)))}
pub(crate) async fn packets(state:&BuddyState,session_id:&str)->Result<Vec<engine::Packet>,String>{
    let (path,growing)=location(state,session_id)?;
    let permit=READ_SLOTS.try_acquire().map_err(|_|"Native analyzer is busy; retry shortly")?;
    let result=tokio::task::spawn_blocking(move||load_file(&path,growing)).await.map_err(|e|format!("Native analyzer failed: {e}"))?;
    drop(permit);result
}

#[tauri::command]
pub async fn buddy_open_file(path:String,state:State<'_,BuddyState>)->Result<BuddyStatus,String>{
    let mut audit=crate::services::logging::OperationAudit::new("import");
    let _permit=READ_SLOTS.try_acquire().map_err(|_|"Native analyzer is busy; retry shortly")?;
    let path=std::fs::canonicalize(path).map_err(|e|e.to_string())?;
    let check=path.clone();tokio::task::spawn_blocking(move||load_file(&check,false)).await.map_err(|e|e.to_string())??;
    let mut map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;
    if map.len()>=8{return Err("Close an existing session first (maximum 8).".into());}
    let key=id();let s=Session{path,worker:None,error:Arc::new(Mutex::new(None))};let result=status(key.clone(),&s);map.insert(key,s);audit.complete(1);Ok(result)
}
fn rows(packets:Vec<engine::Packet>,query:&buddy_search::Query,after:u64)->PacketPage{
    let mut found=packets.into_iter().filter(|p|p.frame.number>after&&query.matches(p));
    let rows=found.by_ref().take(200).map(|p|PacketRow{number:p.frame.number,time:p.time.map(|t|format!("{t:.6}")).unwrap_or_else(||"unavailable".into()),source:p.source,destination:p.destination,protocol:p.protocol,length:p.frame.wire_len.to_string(),info:p.info}).collect();
    PacketPage{packets:rows,has_more:found.next().is_some()}
}
#[tauri::command]
pub async fn buddy_search_packets(session_id:String,query:String,after:Option<u64>,state:State<'_,BuddyState>)->Result<SearchPage,String>{
    let mut audit=crate::services::logging::OperationAudit::new("search");
    let query=buddy_search::compile(&query)?;let page=rows(packets(&state,&session_id).await?,&query,after.unwrap_or(0));
    audit.complete(page.packets.len() as u64);
    Ok(SearchPage{packets:page.packets,has_more:page.has_more,translated_filter:query.description})
}
#[tauri::command]
pub async fn buddy_packets(session_id:String,display_filter:String,after:Option<u64>,state:State<'_,BuddyState>)->Result<PacketPage,String>{
    let query=buddy_search::compile(&display_filter)?;Ok(rows(packets(&state,&session_id).await?,&query,after.unwrap_or(0)))
}
#[tauri::command]
pub async fn buddy_packet_detail(session_id:String,number:u64,state:State<'_,BuddyState>)->Result<PacketDetail,String>{
    let p=packets(&state,&session_id).await?.into_iter().find(|p|p.frame.number==number).ok_or("Packet not found")?;
    Ok(PacketDetail{number,dissection:engine::dissection(&p)})
}

#[tauri::command]
pub async fn buddy_follow_tcp(session_id:String,number:u64,state:State<'_,BuddyState>)->Result<String,String>{
    let all=packets(&state,&session_id).await?;
    reconstruct_tcp(&all,number)
}
fn reconstruct_tcp(all:&[engine::Packet],number:u64)->Result<String,String>{
    let chosen=all.iter().find(|p|p.frame.number==number).ok_or("Packet not found")?;
    let stream=chosen.stream.ok_or("Select a decoded TCP packet")?;
    let source=(&chosen.source,chosen.source_port);
    let mut output=format!("Capture Buddy native TCP reconstruction · connection {stream}\nDirections are reconstructed independently. Missing bytes and overlaps are marked; payload is not decrypted. Midstream captures and reused tuples without an observed SYN can remain ambiguous.\n\n");
    for forward in [true,false] {
        let segments:Vec<_>=all.iter().filter(|p|p.stream==Some(stream)&&!p.payload.is_empty()&&((&p.source,p.source_port)==source)==forward).collect();
        if segments.is_empty(){continue;}
        let first=segments[0];let origin=first.tcp_seq.unwrap().wrapping_add(if first.tcp_flags&2!=0{1}else{0});
        let mut ordered:Vec<_>=segments.iter().map(|p|{let seq=p.tcp_seq.unwrap().wrapping_add(if p.tcp_flags&2!=0{1}else{0});(seq.wrapping_sub(origin) as i32 as i64,*p)}).collect();ordered.sort_by_key(|(seq,_)|*seq);
        output.push_str(&format!("{}:{} → {}:{}\n",first.source,first.source_port.unwrap(),first.destination,first.destination_port.unwrap()));
        let mut end=None;
        for (seq,p) in ordered {
            let mut skip=0;
            if let Some(previous)=end {
                if seq>previous {output.push_str(&format!("\n[{} bytes missing]\n",seq-previous));}
                if seq<previous {skip=((previous-seq) as usize).min(p.payload.len());output.push_str(&format!("\n[{skip} overlapping bytes omitted; overlap contents are not validated]\n"));}
            }
            for &byte in &p.payload[skip..] {if byte==b'\n'||byte==b'\r'||byte==b'\t'||(32..127).contains(&byte){output.push(byte as char);}else{output.push_str(&format!("\\x{byte:02x}"));}}
            end=Some(end.unwrap_or(seq).max(seq+p.payload.len() as i64));
            if output.len()>1024*1024{return Err("Reconstructed stream exceeds 1 MiB; select a smaller recording.".into());}
        }
        output.push_str("\n\n");
    }
    Ok(output)
}
#[tauri::command]
pub async fn buddy_statistics(session_id:String,state:State<'_,BuddyState>)->Result<String,String>{
    let all=packets(&state,&session_id).await?;let mut protocols=std::collections::BTreeMap::new();let mut paths=std::collections::BTreeMap::new();let mut wire=0u64;let mut captured=0u64;
    for p in &all {wire+=p.frame.wire_len as u64;captured+=p.frame.data.len() as u64;*protocols.entry(p.protocol.clone()).or_insert(0usize)+=1;if !p.source.is_empty()&&!p.destination.is_empty(){*paths.entry(format!("{}:{} → {}:{}",p.source,p.source_port.map(|v|v.to_string()).unwrap_or_default(),p.destination,p.destination_port.map(|v|v.to_string()).unwrap_or_default())).or_insert(0usize)+=1;}}
    let mut text=format!("Capture Buddy native recording summary\nPackets: {}\nCaptured bytes: {captured}\nReported wire bytes: {wire}\n\nDeepest decoded protocol\n",all.len());
    for (protocol,count) in protocols{text.push_str(&format!("{protocol}: {count}\n"));}
    text.push_str("\nObserved directional paths (up to 500)\n");for(path,count)in paths.iter().take(500){text.push_str(&format!("{path}: {count} packets\n"));}Ok(text)
}

#[tauri::command]
pub async fn buddy_investigation_brief(session_id:String,state:State<'_,BuddyState>)->Result<InvestigationBrief,String>{
    let all=packets(&state,&session_id).await?;
    Ok(crate::services::capture_brief::build(&all))
}

#[tauri::command]
pub fn buddy_session_status(session_id:String,state:State<'_,BuddyState>)->Result<BuddyStatus,String>{
    let mut map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;let s=map.get_mut(&session_id).ok_or("Capture session not found")?;
    if s.worker.as_ref().map(|w|w.thread.is_finished()).unwrap_or(false){let worker=s.worker.take().unwrap();if worker.thread.join().is_err(){return Err("Native capture worker failed".into());}}
    if let Some(error)=s.error.lock().map_err(|_|"Capture diagnostics unavailable")?.take(){return Err(error);}
    Ok(status(session_id,s))
}

fn write_header(file:&mut std::fs::File,link:u32)->std::io::Result<()> {
    file.write_all(&0xa1b2c3d4u32.to_le_bytes())?;file.write_all(&2u16.to_le_bytes())?;file.write_all(&4u16.to_le_bytes())?;
    for n in [0u32,0,65535,link]{file.write_all(&n.to_le_bytes())?;}Ok(())
}
#[tauri::command]
pub fn buddy_start(interface:String,capture_filter:String,duration_seconds:Option<u32>,state:State<'_,BuddyState>)->Result<BuddyStatus,String>{
    let mut audit=crate::services::logging::OperationAudit::new("capture_start");
    let duration=duration_arg(duration_seconds.unwrap_or(60))?;
    capture_access()?;
    if interface.is_empty()||capture_filter.len()>2048{return Err("Invalid interface or capture filter".into());}
    let mut map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;
    if map.len()>=8||map.values().any(|s|s.worker.as_ref().map(|w|!w.thread.is_finished()).unwrap_or(false)){return Err("Close unused sessions and stop the running recording first.".into());}
    let devices=pcap::Device::list().map_err(|e|e.to_string())?;
    let device=if let Ok(index)=interface.parse::<usize>(){devices.into_iter().nth(index.checked_sub(1).ok_or("Invalid interface index")?).ok_or("Interface not found")?}else{devices.into_iter().find(|d|d.name==interface).ok_or("Interface not found")?};
    #[cfg(target_os="linux")]
    {let result=start_helper(device.name,capture_filter,duration,&mut map);if result.is_ok(){audit.complete(1);}return result;}
    #[cfg(not(target_os="linux"))]
    {
    let mut capture=pcap::Capture::from_device(device).map_err(|e|e.to_string())?.promisc(false).snaplen(65535).timeout(100).open().map_err(|e|format!("Native capture permission/interface error: {e}"))?.setnonblock().map_err(|e|e.to_string())?;
    if !capture_filter.trim().is_empty(){capture.filter(&capture_filter,true).map_err(|e|format!("Capture filter: {e}"))?;}
    let folder=crate::database::sqlite::get_app_dir().join("captures");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let key=id();let path=folder.join(format!("{key}.pcap"));let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;
    write_header(&mut file,capture.get_datalink().0 as u32).map_err(|e|e.to_string())?;
    let stop=Arc::new(AtomicBool::new(false));let worker_stop=stop.clone();let error=Arc::new(Mutex::new(None));let worker_error=error.clone();
    let thread=std::thread::Builder::new().name("capture-buddy-native".into()).spawn(move||{
        let result=(||->Result<(),String>{let started=Instant::now();let mut bytes=24usize;let mut count=0;
            while !worker_stop.load(Ordering::Acquire)&&started.elapsed()<duration&&bytes<32*1024*1024&&count<100_000 {
                match capture.next_packet(){
                    Ok(packet)=>{let length=packet.data.len();if bytes+16+length>32*1024*1024{break;}
                        for n in [packet.header.ts.tv_sec as u32,packet.header.ts.tv_usec as u32,length as u32,packet.header.len]{file.write_all(&n.to_le_bytes()).map_err(|e|e.to_string())?;}
                        file.write_all(packet.data).map_err(|e|e.to_string())?;bytes+=16+length;count+=1;
                    }
                    Err(pcap::Error::TimeoutExpired)=>std::thread::sleep(Duration::from_millis(20)),
                    Err(e)=>return Err(format!("Native capture read failed: {e}")),
                }
            }file.sync_all().map_err(|e|e.to_string())?;Ok(())})();
        tracing::info!(operation="capture_complete",success=result.is_ok());
        if let Err(e)=result{if let Ok(mut value)=worker_error.lock(){*value=Some(e);}}
    }).map_err(|e|e.to_string())?;
    let s=Session{path,worker:Some(Worker{stop,thread}),error};let result=status(key.clone(),&s);map.insert(key,s);audit.complete(1);Ok(result)
    }
}

#[cfg(target_os="linux")]
fn start_helper(interface:String,filter:String,duration:Duration,map:&mut HashMap<String,Session>)->Result<BuddyStatus,String>{
    use std::process::{Command,Stdio};
    let folder=crate::database::sqlite::get_app_dir().join("captures");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let key=id();let path=folder.join(format!("{key}.pcap"));let diagnostics=folder.join(format!("{key}.log"));
    let file=std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;
    let errors=std::fs::OpenOptions::new().write(true).create_new(true).open(&diagnostics).map_err(|e|e.to_string())?;
    let mut child=Command::new(HELPER_PATH).args([interface,duration.as_secs().to_string(),filter]).env_clear()
        .stdin(Stdio::piped()).stdout(Stdio::from(file)).stderr(Stdio::from(errors)).spawn().map_err(|e|format!("Native helper failed to start: {e}"))?;
    let stop=Arc::new(AtomicBool::new(false));let worker_stop=stop.clone();let error=Arc::new(Mutex::new(None));let worker_error=error.clone();
    let thread=std::thread::spawn(move||{
        let started=Instant::now();let mut stop_at=None;
        let result=(||->Result<(),String>{loop{
            if let Some(exit)=child.try_wait().map_err(|e|e.to_string())?{
                if !exit.success(){let mut detail=String::new();if let Ok(file)=std::fs::File::open(&diagnostics){let _=file.take(4096).read_to_string(&mut detail);}return Err(format!("Native capture failed: {}",detail.trim()));}return Ok(());
            }
            if (worker_stop.load(Ordering::Acquire)||started.elapsed()>duration+Duration::from_secs(3))&&stop_at.is_none(){
                if let Some(mut input)=child.stdin.take(){let _=input.write_all(b"stop\n");}stop_at=Some(Instant::now());
            }
            if stop_at.map(|t|t.elapsed()>Duration::from_millis(1500)).unwrap_or(false){let _=child.kill();let _=child.wait();return Err("Native recorder did not stop cleanly; final packet may be incomplete.".into());}
            std::thread::sleep(Duration::from_millis(20));
        }})();
        tracing::info!(operation="capture_complete",success=result.is_ok(),duration_ms=started.elapsed().as_millis().min(u64::MAX as u128) as u64);
        if let Err(e)=result{if let Ok(mut value)=worker_error.lock(){*value=Some(e);}}
    });
    let s=Session{path,worker:Some(Worker{stop,thread}),error};let result=status(key.clone(),&s);map.insert(key,s);Ok(result)
}
fn stop_session(s:&mut Session)->Result<(),String>{
    if let Some(worker)=s.worker.as_ref(){worker.stop.store(true,Ordering::Release);let deadline=Instant::now()+Duration::from_secs(2);while !worker.thread.is_finished()&&Instant::now()<deadline{std::thread::sleep(Duration::from_millis(20));}if !worker.thread.is_finished(){return Err("Recording is still flushing. Retry shortly; session has not been discarded.".into());}}
    if let Some(worker)=s.worker.take(){worker.thread.join().map_err(|_|"Native capture worker failed")?;}Ok(())
}
#[tauri::command]
pub fn buddy_stop(session_id:String,state:State<'_,BuddyState>)->Result<(),String>{
    let mut audit=crate::services::logging::OperationAudit::new("capture_stop");
    let mut map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;
    let result=stop_session(map.get_mut(&session_id).ok_or("Capture session not found")?);
    if result.is_ok(){audit.complete(1);}result
}
#[tauri::command]
pub fn buddy_close(session_id:String,state:State<'_,BuddyState>)->Result<(),String>{let mut map=state.sessions.lock().map_err(|_|"Capture state unavailable")?;if let Some(s)=map.get_mut(&session_id){stop_session(s)?;}map.remove(&session_id);Ok(())}
impl BuddyState{pub fn shutdown(&self){if let Ok(mut map)=self.sessions.lock(){for s in map.values_mut(){let _=stop_session(s);}}}}
impl Drop for BuddyState{fn drop(&mut self){self.shutdown();}}

#[tauri::command]
pub async fn buddy_save_file(session_id:String,destination:String,state:State<'_,BuddyState>)->Result<SavedRecording,String>{
    let mut audit=crate::services::logging::OperationAudit::new("export");
    let _permit=READ_SLOTS.try_acquire().map_err(|_|"Native analyzer is busy; retry shortly")?;
    let (source,running)=location(&state,&session_id)?;if running{return Err("Finish recording before saving a copy.".into());}
    let result=tokio::task::spawn_blocking(move||save_recording(&source,&PathBuf::from(destination))).await.map_err(|e|e.to_string())?;
    if result.is_ok(){audit.complete(1);}result
}
fn save_recording(source:&Path,destination:&Path)->Result<SavedRecording,String>{
    if !destination.is_absolute(){return Err("Enter an absolute destination path including the filename.".into());}
    let input=std::fs::File::open(source).map_err(|e|e.to_string())?;let meta=input.metadata().map_err(|e|e.to_string())?;
    if !meta.is_file()||meta.len()>engine::MAX_BYTES as u64{return Err("Recording must be a regular file up to 64 MiB".into());}
    let mut bytes=Vec::new();input.take(engine::MAX_BYTES as u64+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;engine::read_capture(&bytes,false)?;
    let ext=if bytes.starts_with(&[0x0a,0x0d,0x0d,0x0a]){"pcapng"}else{"pcap"};
    if destination.extension().and_then(|e|e.to_str()).map(str::to_ascii_lowercase).as_deref()!=Some(ext){return Err(format!("Use a .{ext} filename to preserve the recording format."));}
    let mut output=std::fs::OpenOptions::new().write(true).create_new(true).open(destination).map_err(|e|if e.kind()==std::io::ErrorKind::AlreadyExists{"A file already exists there; choose a new filename.".into()}else{format!("Cannot save recording: {e}")})?;
    if let Err(e)=output.write_all(&bytes).and_then(|_|output.sync_all()){drop(output);let _=std::fs::remove_file(destination);return Err(e.to_string());}
    Ok(SavedRecording{path:destination.display().to_string(),bytes:bytes.len() as u64})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn duration_and_launch_bounds(){assert_eq!(duration_arg(137).unwrap().as_secs(),137);assert!(duration_arg(0).is_err());assert!(duration_arg(3601).is_err());assert!(restricted_launch("NoNewPrivs:\t1\nCapEff:\t0\n"));assert!(!restricted_launch("NoNewPrivs:\t0\nCapEff:\t0\n"));}
    #[test]fn native_save_reopens_exact_bytes_and_protects_existing_file(){
        let root=std::env::temp_dir().join(format!("buddy-native-save-{}",id()));std::fs::create_dir(&root).unwrap();
        let source=root.join("original.pcap");let destination=root.join("saved.pcap");
        let bytes=engine::tests::capture_bytes(1,&[engine::tests::dns_packet()]);std::fs::write(&source,&bytes).unwrap();
        assert_eq!(save_recording(&source,&destination).unwrap().bytes,bytes.len()as u64);assert_eq!(load_file(&destination,false).unwrap()[0].protocol,"DNS");assert_eq!(std::fs::read(&destination).unwrap(),bytes);
        assert!(save_recording(&source,&destination).is_err());assert!(save_recording(&source,&root.join("wrong.pcapng")).is_err());std::fs::remove_dir_all(root).unwrap();
    }
    #[test]fn tcp_reconstruction_orders_segments_and_marks_gaps_overlaps(){
        let segments=vec![engine::tests::tcp_packet(100,16,b"foo"),engine::tests::tcp_packet(106,16,b"ghi"),engine::tests::tcp_packet(103,16,b"bar"),engine::tests::tcp_packet(103,16,b"bar"),engine::tests::tcp_packet(112,16,b"nop")];
        let packets=engine::analyze(engine::read_capture(&engine::tests::capture_bytes(1,&segments),false).unwrap());let text=reconstruct_tcp(&packets,1).unwrap();
        assert!(text.find("foo").unwrap()<text.find("bar").unwrap());assert!(text.find("bar").unwrap()<text.find("ghi").unwrap());assert!(text.contains("3 bytes missing"));assert!(text.contains("3 overlapping bytes omitted"));
    }
}
