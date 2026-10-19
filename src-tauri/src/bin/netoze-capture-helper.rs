//! Small capture-only executable. No GUI, file paths, shell or protocol decoder.
//! The parent opens output files as the ordinary user and supplies file descriptors.
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

fn access() -> (bool, bool) {
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    let caps = status
        .lines()
        .find_map(|s| s.strip_prefix("CapEff:"))
        .and_then(|s| u64::from_str_radix(s.trim(), 16).ok())
        .unwrap_or(0);
    let restricted = status
        .lines()
        .find_map(|s| s.strip_prefix("NoNewPrivs:"))
        .map(str::trim)
        == Some("1");
    (caps & (1 << 13) != 0, restricted)
}
fn arguments(args: &[String]) -> Result<(&str, u64, &str, bool, &str, u32, u64, u64), String> {
    // Keep the three-argument wire format used by helpers installed by older
    // NET0ZE packages. The GUI may outlive the system helper package, so a
    // protocol mismatch must not make Capture Buddy unusable after an app
    // update. Legacy invocations use the same bounded, non-promiscuous,
    // bidirectional defaults as the native capture path.
    if args.len() == 3 {
        let seconds: u64 = args[1].parse().map_err(|_| "Invalid duration")?;
        if !(1..=3600).contains(&seconds)
            || args[0].is_empty()
            || args[0].len() > 256
            || args[2].len() > 2048
            || args[0].contains('\0')
            || args[2].contains('\0')
        {
            return Err("Invalid capture options".into());
        }
        return Ok((&args[0], seconds, &args[2], false, "inout", 65535, 32 * 1024 * 1024, 100000));
    }
    if args.len() != 8 {
        return Err("Expected interface, seconds, filter, promiscuous, direction, snapshot length, size and packet bounds".into());
    }
    let seconds: u64 = args[1].parse().map_err(|_| "Invalid duration")?;
    let promiscuous = match args[3].as_str() {
        "true" => true,
        "false" => false,
        _ => return Err("Invalid promiscuous mode".into()),
    };
    if !(1..=3600).contains(&seconds)
        || !matches!(args[4].as_str(), "in" | "out" | "inout")
        || args[0].is_empty()
        || args[0].len() > 256
        || args[2].len() > 2048
        || args[0].contains('\0')
        || args[2].contains('\0')
    {
        return Err("Invalid capture options".into());
    }
    let snap = args[5].parse().map_err(|_| "Invalid snapshot length")?;
    let max_bytes = args[6].parse().map_err(|_| "Invalid size bound")?;
    let max_packets = args[7].parse().map_err(|_| "Invalid packet bound")?;
    if !(64..=262144).contains(&snap)
        || max_bytes < 24
        || max_bytes > 32 * 1024 * 1024
        || max_packets == 0
        || max_packets > 100000
    {
        return Err("Invalid capture bounds".into());
    }
    Ok((
        &args[0],
        seconds,
        &args[2],
        promiscuous,
        &args[4],
        snap,
        max_bytes,
        max_packets,
    ))
}
fn capture(args: &[String]) -> Result<(), String> {
    let (
        interface,
        seconds,
        filter,
        promiscuous,
        direction,
        snapshot_length,
        max_bytes,
        max_packets,
    ) = arguments(args)?;
    let device = pcap::Device::list()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|d| d.name == interface)
        .ok_or("Unknown local interface")?;
    let mut capture = pcap::Capture::from_device(device)
        .map_err(|e| e.to_string())?
        .promisc(promiscuous)
        .snaplen(snapshot_length as i32)
        .timeout(100)
        .open()
        .map_err(|e| e.to_string())?;
    capture
        .direction(match direction {
            "in" => pcap::Direction::In,
            "out" => pcap::Direction::Out,
            _ => pcap::Direction::InOut,
        })
        .map_err(|e| e.to_string())?;
    let mut capture = capture.setnonblock().map_err(|e| e.to_string())?;
    if !filter.is_empty() {
        capture.filter(filter, true).map_err(|e| e.to_string())?;
    }
    let stop = Arc::new(AtomicBool::new(false));
    let input_stop = stop.clone();
    std::thread::spawn(move || {
        let mut byte = [0];
        let _ = std::io::stdin().read(&mut byte);
        input_stop.store(true, Ordering::Release);
    });
    let mut out = std::io::stdout().lock();
    out.write_all(&0xa1b2c3d4u32.to_le_bytes())
        .map_err(|e| e.to_string())?;
    out.write_all(&2u16.to_le_bytes())
        .map_err(|e| e.to_string())?;
    out.write_all(&4u16.to_le_bytes())
        .map_err(|e| e.to_string())?;
    for value in [0u32, 0, snapshot_length, capture.get_datalink().0 as u32] {
        out.write_all(&value.to_le_bytes())
            .map_err(|e| e.to_string())?;
    }
    out.flush().map_err(|e| e.to_string())?;
    let started = Instant::now();
    let mut bytes = 24usize;
    let mut packets = 0;
    while !stop.load(Ordering::Acquire)
        && started.elapsed() < Duration::from_secs(seconds)
        && bytes < max_bytes as usize
        && packets < max_packets
    {
        match capture.next_packet() {
            Ok(packet) => {
                let size = packet.data.len();
                if bytes
                    .checked_add(16 + size)
                    .map_or(true, |next| next > max_bytes as usize)
                {
                    break;
                }
                for value in [
                    packet.header.ts.tv_sec as u32,
                    packet.header.ts.tv_usec as u32,
                    size as u32,
                    packet.header.len,
                ] {
                    out.write_all(&value.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                out.write_all(packet.data).map_err(|e| e.to_string())?;
                out.flush().map_err(|e| e.to_string())?;
                bytes += 16 + size;
                packets += 1;
            }
            Err(pcap::Error::TimeoutExpired) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => return Err(error.to_string()),
        }
    }
    out.flush().map_err(|e| e.to_string())
}
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--check"] {
        let (capability, restricted) = access();
        println!(
            "NETOZE_CAPTURE_V1 net_raw={} restricted={}",
            u8::from(capability),
            u8::from(restricted)
        );
        return;
    }
    if let Err(error) = capture(&args) {
        eprintln!("Native capture helper: {error}");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn options_have_fixed_shape_and_bounds() {
        let legacy = vec!["eth0".into(), "60".into(), "tcp".into()];
        assert!(super::arguments(&legacy).is_ok());
        let valid = (0..8)
            .map(|i| {
                match i {
                    0 => "eth0",
                    1 => "60",
                    2 => "tcp",
                    3 => "false",
                    4 => "inout",
                    5 => "65535",
                    6 => "33554432",
                    _ => "100000",
                }
                .into()
            })
            .collect::<Vec<String>>();
        assert!(super::arguments(&valid).is_ok());
        let mut invalid = valid.clone();
        invalid[5] = "63".into();
        assert!(super::arguments(&invalid).is_err());
        invalid = valid.clone();
        invalid[4] = "sideways".into();
        assert!(super::arguments(&invalid).is_err());
    }
}
