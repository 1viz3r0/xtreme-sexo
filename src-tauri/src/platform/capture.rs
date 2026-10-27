use crate::models::PacketCaptureCapability;

#[cfg(any(windows, test))]
const PCAP_EXPORTS: &[&[u8]] = &[
    b"pcap_activate\0", b"pcap_close\0", b"pcap_compile\0", b"pcap_create\0",
    b"pcap_datalink\0", b"pcap_findalldevs\0", b"pcap_freealldevs\0", b"pcap_freecode\0",
    b"pcap_geterr\0", b"pcap_next_ex\0", b"pcap_set_promisc\0", b"pcap_set_snaplen\0",
    b"pcap_set_timeout\0", b"pcap_setdirection\0", b"pcap_setfilter\0", b"pcap_setnonblock\0",
];

#[cfg(any(windows, test))]
fn complete_runtime(has_export: impl FnMut(&&[u8]) -> bool) -> bool {
    PCAP_EXPORTS.iter().all(has_export)
}

/// Gate every native pcap entry point; saved-file analysis does not need Npcap.
pub fn ensure_capture_runtime() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::{ffi::OsString, os::windows::ffi::{OsStrExt, OsStringExt}, path::PathBuf, sync::OnceLock};
        use windows_sys::Win32::System::{LibraryLoader::{GetProcAddress, LoadLibraryExW,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32}, SystemInformation::GetSystemDirectoryW};
        use windows_sys::Win32::Foundation::FreeLibrary;

        // Keep a successful module pinned for the process lifetime. Neither
        // PATH, the application directory nor the working directory is searched.
        static RUNTIME: OnceLock<Result<isize, String>> = OnceLock::new();
        RUNTIME.get_or_init(|| {
            let mut buffer = vec![0u16; 32768];
            let length = unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
            if length == 0 || length >= buffer.len() {
                return Err("Windows system directory is unavailable; native capture is disabled".into());
            }
            let system = PathBuf::from(OsString::from_wide(&buffer[..length]));
            for path in [system.join("Npcap").join("wpcap.dll"), system.join("wpcap.dll")] {
                let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
                let module = unsafe { LoadLibraryExW(wide.as_ptr(), 0,
                    LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32) };
                if module == 0 { continue; }
                if complete_runtime(|name| unsafe { GetProcAddress(module, name.as_ptr()).is_some() }) {
                    return Ok(module);
                }
                unsafe { FreeLibrary(module); }
            }
            Err("Npcap runtime is missing or incompatible. Install an approved Npcap runtime and restart NET0ZE; saved-file review remains available.".into())
        }).as_ref().map(|_| ()).map_err(Clone::clone)
    }
    #[cfg(not(windows))]
    { Ok(()) }
}

pub fn devices() -> Result<Vec<pcap::Device>, pcap::Error> {
    ensure_capture_runtime().map_err(pcap::Error::PcapError)?;
    pcap::Device::list()
}

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
        match devices() {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incomplete_capture_libraries_are_rejected_before_delay_loaded_calls() {
        assert!(complete_runtime(|_| true));
        for missing in PCAP_EXPORTS {
            assert!(!complete_runtime(|symbol| symbol != missing));
        }
        assert!(!complete_runtime(|_| false));
    }
}
