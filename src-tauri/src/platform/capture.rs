use crate::models::PacketCaptureCapability;

/// Inspect the native capture backend without opening a capture or sending traffic.
/// Enumeration is not proof of permission to open an interface; start_capture
/// reports that driver/permission error from pcap when the user starts capture.
pub fn inspect_packet_capture() -> PacketCaptureCapability {
    #[cfg(windows)]
    {
        let available = super::windows::inspect_npcap().installed;
        PacketCaptureCapability {
            available,
            driver: "Npcap".into(),
            reason: if available {
                "Npcap detected; interface access is checked when capture starts"
            } else {
                "Npcap is not installed or cannot enumerate interfaces"
            }.into(),
        }
    }
    #[cfg(target_os = "linux")]
    {
        match pcap::Device::list() {
            Ok(devices) => PacketCaptureCapability {
                available: !devices.is_empty(),
                driver: "libpcap".into(),
                reason: if devices.is_empty() {
                    "libpcap found no capture interfaces"
                } else {
                    "libpcap interfaces detected; capture permissions are checked when capture starts"
                }.into(),
            },
            Err(error) => PacketCaptureCapability {
                available: false,
                driver: "libpcap".into(),
                reason: format!("libpcap interface enumeration failed: {}", error),
            },
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        PacketCaptureCapability {
            available: false,
            driver: "None".into(),
            reason: "Native capture is supported on Windows and Linux".into(),
        }
    }
}
