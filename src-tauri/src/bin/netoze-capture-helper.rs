//! Small capture-only executable. No GUI, file paths, shell or protocol decoder.
//! The parent opens output files as the ordinary user and supplies file descriptors.
use std::{io::{Read,Write},sync::{Arc,atomic::{AtomicBool,Ordering}},time::{Duration,Instant}};

fn access()->(bool,bool){
    let status=std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    let caps=status.lines().find_map(|s|s.strip_prefix("CapEff:")).and_then(|s|u64::from_str_radix(s.trim(),16).ok()).unwrap_or(0);
    let restricted=status.lines().find_map(|s|s.strip_prefix("NoNewPrivs:")).map(str::trim)==Some("1");
    (caps&(1<<13)!=0,restricted)
}
fn arguments(args:&[String])->Result<(&str,u64,&str),String>{
    if args.len()!=3{return Err("Expected interface, seconds and capture filter".into());}
    let seconds:u64=args[1].parse().map_err(|_|"Invalid duration")?;
    if !(1..=3600).contains(&seconds)||args[0].len()>256||args[2].len()>2048{return Err("Invalid capture options".into());}
    Ok((&args[0],seconds,&args[2]))
}
fn capture(args:&[String])->Result<(),String>{
    let(interface,seconds,filter)=arguments(args)?;
    let device=pcap::Device::list().map_err(|e|e.to_string())?.into_iter().find(|d|d.name==interface).ok_or("Unknown local interface")?;
    let mut capture=pcap::Capture::from_device(device).map_err(|e|e.to_string())?.promisc(false).snaplen(65535).timeout(100).open().map_err(|e|e.to_string())?.setnonblock().map_err(|e|e.to_string())?;
    if !filter.is_empty(){capture.filter(filter,true).map_err(|e|e.to_string())?;}
    let stop=Arc::new(AtomicBool::new(false));let input_stop=stop.clone();
    std::thread::spawn(move||{let mut byte=[0];let _=std::io::stdin().read(&mut byte);input_stop.store(true,Ordering::Release);});
    let mut out=std::io::stdout().lock();
    out.write_all(&0xa1b2c3d4u32.to_le_bytes()).map_err(|e|e.to_string())?;
    out.write_all(&2u16.to_le_bytes()).map_err(|e|e.to_string())?;out.write_all(&4u16.to_le_bytes()).map_err(|e|e.to_string())?;
    for value in [0u32,0,65535,capture.get_datalink().0 as u32]{out.write_all(&value.to_le_bytes()).map_err(|e|e.to_string())?;}
    out.flush().map_err(|e|e.to_string())?;
    let started=Instant::now();let mut bytes=24usize;let mut packets=0;
    while !stop.load(Ordering::Acquire)&&started.elapsed()<Duration::from_secs(seconds)&&bytes<32*1024*1024&&packets<100_000{
        match capture.next_packet(){
            Ok(packet)=>{let size=packet.data.len();if bytes+16+size>32*1024*1024{break;}
                for value in [packet.header.ts.tv_sec as u32,packet.header.ts.tv_usec as u32,size as u32,packet.header.len]{out.write_all(&value.to_le_bytes()).map_err(|e|e.to_string())?;}
                out.write_all(packet.data).map_err(|e|e.to_string())?;out.flush().map_err(|e|e.to_string())?;bytes+=16+size;packets+=1;
            }
            Err(pcap::Error::TimeoutExpired)=>std::thread::sleep(Duration::from_millis(20)),
            Err(error)=>return Err(error.to_string()),
        }
    }
    out.flush().map_err(|e|e.to_string())
}
fn main(){
    let args:Vec<String>=std::env::args().skip(1).collect();
    if args==["--check"]{let(capability,restricted)=access();println!("NETOZE_CAPTURE_V1 net_raw={} restricted={}",u8::from(capability),u8::from(restricted));return;}
    if let Err(error)=capture(&args){eprintln!("Native capture helper: {error}");std::process::exit(1);}
}
#[cfg(test)]
mod tests{
    #[test]fn options_have_fixed_shape_and_bounds(){
        assert!(super::arguments(&["eth0".into(),"60".into(),"tcp".into()]).is_ok());
        assert!(super::arguments(&["eth0".into(),"0".into(),"".into()]).is_err());
        assert!(super::arguments(&["eth0".into(),"3601".into(),"".into()]).is_err());
        assert!(super::arguments(&["eth0".into(),"60".into(),"".into(),"extra".into()]).is_err());
    }
}
