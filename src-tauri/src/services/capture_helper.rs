//! Fixed capture-only helper protocol. The GUI never opens a Linux packet socket.
use std::time::Duration;

pub const HELPER_PATH: &str = "/usr/lib/netoze/netoze-capture-helper";
pub const RESTRICTED_GUIDANCE: &str = "CAPTURE_RESTRICTED: This launch environment blocks packet-capture privileges (NoNewPrivs). Launch NET0ZE from your desktop menu; if still restricted, ask the administrator to review the launch policy. Saved captures remain available.";

pub fn arguments(interface: &str, duration: Duration, filter: &str, promiscuous: bool,
    direction: pcap::Direction, snapshot: u32, max_bytes: u64, max_packets: u64) -> Vec<String> {
    vec![interface.into(), duration.as_secs().to_string(), filter.into(), promiscuous.to_string(),
        match direction { pcap::Direction::In => "in", pcap::Direction::Out => "out", pcap::Direction::InOut => "inout" }.into(),
        snapshot.to_string(), max_bytes.to_string(), max_packets.to_string()]
}

#[cfg(any(target_os = "linux", test))]
pub(crate) fn restricted_launch(status: &str) -> bool {
    let restricted = status.lines().find_map(|s| s.strip_prefix("NoNewPrivs:")).map(str::trim) == Some("1");
    let caps = status.lines().find_map(|s| s.strip_prefix("CapEff:"))
        .and_then(|s| u64::from_str_radix(s.trim(), 16).ok());
    restricted && caps.is_some_and(|n| n & (1 << 13) == 0)
}

#[cfg(target_os = "linux")]
pub(crate) fn helper_setup_guidance_for(appimage: bool) -> String {
    if appimage {
        "CAPTURE_SETUP: This AppImage is portable and cannot install privileged capture access. Install the NET0ZE DEB with your system package manager; its one-time post-install step installs the native helper. Saved captures remain available here.".into()
    } else {
        "CAPTURE_SETUP: Install the new NET0ZE DEB with your system package manager. The previous per-user installation has no privileged native capture helper. Saved captures remain available here.".into()
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::{io::{Read, Write}, os::{fd::AsRawFd, unix::fs::MetadataExt}, process::{Child, ChildStdout, ChildStderr, Command, Stdio}, time::Instant};

    pub fn check_access() -> Result<(), String> {
        if std::fs::read_to_string("/proc/self/status").is_ok_and(|status| restricted_launch(&status)) {
            return Err(RESTRICTED_GUIDANCE.into());
        }
        let metadata = std::fs::metadata(HELPER_PATH).map_err(|_| helper_setup_guidance_for(std::env::var_os("APPIMAGE").is_some()))?;
        if !metadata.is_file() || metadata.uid() != 0 || metadata.mode() & 0o022 != 0 {
            return Err("CAPTURE_SETUP: The capture helper must be root-owned and not writable by ordinary users. Reinstall the NET0ZE DEB.".into());
        }
        let mut child = Command::new(HELPER_PATH).arg("--check").env_clear().stdin(Stdio::null())
            .stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
            .map_err(|e| format!("CAPTURE_SETUP: Cannot access the native helper ({e}). Check membership of netdev; group changes require signing out and back in."))?;
        let deadline = Instant::now() + Duration::from_secs(2);
        let exit = loop {
            match child.try_wait() {
                Ok(Some(exit)) => break exit,
                Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
                result => {
                    let _ = child.kill(); let _ = child.wait();
                    return Err(format!("CAPTURE_SETUP: Capture helper check failed or timed out: {result:?}"));
                }
            }
        };
        let mut response = String::new();
        child.stdout.take().ok_or("Helper check output missing")?.take(256).read_to_string(&mut response).map_err(|e| e.to_string())?;
        if exit.success() && matches!(response.trim(), "NETOZE_CAPTURE_V1 net_raw=1 restricted=0" | "NETOZE_CAPTURE_V1 net_raw=1 restricted=1") {
            Ok(())
        } else {
            Err("CAPTURE_SETUP: Native helper has no usable CAP_NET_RAW capability. Check the launch policy and system helper installation; do not run the desktop GUI as root.".into())
        }
    }

    fn nonblocking(fd: &impl AsRawFd) -> std::io::Result<()> {
        let flags = unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETFL) };
        if flags < 0 || unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }

    #[derive(Default)]
    struct StreamReader {
        buffer: Vec<u8>,
        header: Option<(u32, u32)>,
        bytes: u64,
        packets: u64,
    }

    fn word(bytes: &[u8], offset: usize) -> u32 {
        u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
    }

    impl StreamReader {
        fn header(&mut self, input: &mut impl Read) -> Result<bool, pcap::Error> {
            if self.header.is_some() { return Ok(true); }
            let mut bytes = [0u8; 24];
            while self.buffer.len() < 24 {
                let needed = 24 - self.buffer.len();
                match input.read(&mut bytes[..needed]) {
                    Ok(0) => return Err(pcap::Error::PcapError("Helper ended before its capture header; check permissions and helper version".into())),
                    Ok(n) => self.buffer.extend_from_slice(&bytes[..n]),
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return Ok(false),
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => return Err(pcap::Error::PcapError(e.to_string())),
                }
            }
            if self.buffer[..8] != [0xd4, 0xc3, 0xb2, 0xa1, 2, 0, 4, 0]
                || !(64..=262144).contains(&word(&self.buffer, 16)) {
                return Err(pcap::Error::PcapError("Invalid native helper PCAP header".into()));
            }
            self.header = Some((word(&self.buffer, 16), word(&self.buffer, 20)));
            self.bytes = 24;
            self.buffer.clear();
            Ok(true)
        }

        fn next(&mut self, input: &mut impl Read) -> Result<(Vec<u8>, String), pcap::Error> {
            if !self.header(input)? { return Err(pcap::Error::TimeoutExpired); }
            loop {
                if self.buffer.len() >= 16 {
                    let length = word(&self.buffer, 8) as usize;
                    let wire = word(&self.buffer, 12);
                    if length > self.header.unwrap().0 as usize || length > wire as usize
                        || wire as usize > super::super::buddy_engine::MAX_BYTES
                        || word(&self.buffer, 4) >= 1_000_000 {
                        return Err(pcap::Error::PcapError("Invalid native helper packet record".into()));
                    }
                    if self.buffer.len() >= 16 + length {
                        self.bytes += (16 + length) as u64;
                        self.packets += 1;
                        if self.bytes > 32 * 1024 * 1024 || self.packets > 100_000 {
                            return Err(pcap::Error::PcapError("Native helper exceeded capture bounds".into()));
                        }
                        let timestamp = chrono::DateTime::from_timestamp(word(&self.buffer, 0) as i64, word(&self.buffer, 4) * 1000)
                            .ok_or_else(|| pcap::Error::PcapError("Invalid capture timestamp".into()))?.to_rfc3339();
                        let data = self.buffer[16..16 + length].to_vec();
                        self.buffer.drain(..16 + length);
                        return Ok((data, timestamp));
                    }
                }
                let mut bytes = [0u8; 8192];
                match input.read(&mut bytes) {
                    Ok(0) if self.buffer.is_empty() => return Err(pcap::Error::NoMorePackets),
                    Ok(0) => return Err(pcap::Error::PcapError("Truncated native helper packet".into())),
                    Ok(n) => self.buffer.extend_from_slice(&bytes[..n]),
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return Err(pcap::Error::TimeoutExpired),
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => return Err(pcap::Error::PcapError(e.to_string())),
                }
            }
        }
    }

    pub struct HelperCapture {
        child: Child,
        stdout: ChildStdout,
        stderr: ChildStderr,
        reader: StreamReader,
        diagnostics: Vec<u8>,
        started: Instant,
    }

    impl HelperCapture {
        pub fn open(interface: &str, filter: &str) -> Result<Self, pcap::Error> {
            check_access().map_err(pcap::Error::PcapError)?;
            let child = Command::new(HELPER_PATH).args(arguments(interface, Duration::from_secs(3600), filter, false,
                pcap::Direction::InOut, 65535, 32 * 1024 * 1024, 100_000))
                .env_clear().stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
                .map_err(|e| pcap::Error::PcapError(format!("Native capture helper: {e}")))?;
            Self::from_child(child)
        }

        fn from_child(mut child: Child) -> Result<Self, pcap::Error> {
            let stdout = child.stdout.take().unwrap();
            let stderr = child.stderr.take().unwrap();
            let mut capture = Self { child, stdout, stderr, reader: StreamReader::default(), diagnostics: Vec::new(), started: Instant::now() };
            nonblocking(&capture.stdout).and_then(|_| nonblocking(&capture.stderr)).map_err(|e| pcap::Error::PcapError(e.to_string()))?;
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                capture.drain_diagnostics();
                match capture.reader.header(&mut capture.stdout) {
                    Ok(true) => return Ok(capture),
                    Ok(false) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
                    result => return Err(capture.error(format!("Native helper did not start ({result:?})"))),
                }
            }
        }

        pub fn datalink(&self) -> pcap::Linktype { pcap::Linktype(self.reader.header.unwrap().1 as i32) }

        fn drain_diagnostics(&mut self) {
            let mut buffer = [0u8; 1024];
            // Drain even after the retained diagnostic cap, without blocking packet reads.
            for _ in 0..8 {
                match self.stderr.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => { let retain = n.min(4096usize.saturating_sub(self.diagnostics.len())); self.diagnostics.extend_from_slice(&buffer[..retain]); }
                }
            }
        }

        fn error(&mut self, message: String) -> pcap::Error {
            self.drain_diagnostics();
            pcap::Error::PcapError(format!("{message}: {}", String::from_utf8_lossy(&self.diagnostics).trim()))
        }

        pub fn next_packet(&mut self) -> Result<(Vec<u8>, String), pcap::Error> {
            self.drain_diagnostics();
            if self.started.elapsed() > Duration::from_secs(3603) {
                return Err(self.error("Native helper exceeded its duration".into()));
            }
            match self.reader.next(&mut self.stdout) {
                Err(pcap::Error::NoMorePackets) => match self.child.try_wait() {
                    Ok(Some(exit)) if exit.success() => Err(pcap::Error::NoMorePackets),
                    Ok(Some(_)) => Err(self.error("Native capture helper failed".into())),
                    Ok(None) => Err(pcap::Error::TimeoutExpired),
                    Err(e) => Err(self.error(e.to_string())),
                },
                result => result,
            }
        }
    }

    impl Drop for HelperCapture {
        fn drop(&mut self) {
            if let Some(mut input) = self.child.stdin.take() { let _ = input.write_all(b"stop\n"); }
            let deadline = Instant::now() + Duration::from_millis(300);
            while matches!(self.child.try_wait(), Ok(None)) && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            if !matches!(self.child.try_wait(), Ok(Some(_))) { let _ = self.child.kill(); }
            let _ = self.child.wait();
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn streaming_reader_preserves_packet_boundaries_and_rejects_untrusted_records() {
            let bytes = crate::services::buddy_engine::tests::capture_bytes(1, &[crate::services::buddy_engine::tests::dns_packet()]);
            let mut reader = StreamReader::default();
            let mut input = std::io::Cursor::new(&bytes);
            let packet = reader.next(&mut input).unwrap();
            assert_eq!(packet.0, crate::services::buddy_engine::tests::dns_packet());
            assert_eq!(reader.header.unwrap().1, 1);
            assert!(matches!(reader.next(&mut input), Err(pcap::Error::NoMorePackets)));
            let mut truncated = &bytes[..bytes.len() - 1];
            assert!(StreamReader::default().next(&mut truncated).is_err());
            let mut invalid = bytes.clone();
            invalid[32..36].copy_from_slice(&u32::MAX.to_le_bytes());
            assert!(StreamReader::default().next(&mut &invalid[..]).is_err());
        }

        #[test]
        fn failed_helper_start_and_drop_reap_child_without_packet_access() {
            // A synthetic process protocol fixture, never a privileged recorder.
            let child = Command::new("/bin/sh").args(["-c", "printf 'invalid'; exit 7"])
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
            let pid = child.id();
            assert!(HelperCapture::from_child(child).is_err());
            assert!(!std::path::Path::new(&format!("/proc/{pid}")).exists());

            let header = crate::services::buddy_engine::tests::capture_bytes(1, &[]);
            let escaped: String = header.iter().map(|byte| format!("\\{byte:03o}")).collect();
            let child = Command::new("/bin/sh").args(["-c", &format!("printf '{escaped}'; IFS= read -r stop")])
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
            let pid = child.id();
            let recorder = HelperCapture::from_child(child).unwrap();
            assert_eq!(recorder.datalink(), pcap::Linktype::ETHERNET);
            drop(recorder);
            assert!(!std::path::Path::new(&format!("/proc/{pid}")).exists());
        }
    }
}

#[cfg(target_os = "linux")]
pub use linux::{check_access, HelperCapture};

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_capture_options_reach_the_helper_exactly() {
        assert_eq!(arguments("fixture", Duration::from_secs(7), "udp port 49000", true, pcap::Direction::Out, 128, 1024, 3),
            ["fixture", "7", "udp port 49000", "true", "out", "128", "1024", "3"]);
    }
}
