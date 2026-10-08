//! Explicit, bounded TCP service observations, independent of the scan engine.
use serde::Serialize;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;

const TOTAL_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_READ: usize = 16_384;
const MAX_EVIDENCE: usize = 4_096;
const HEAD_REQUEST: &[u8] = b"HEAD / HTTP/1.0\r\nConnection: close\r\n\r\n";
const PREVIEW_REQUEST: &[u8] = b"GET / HTTP/1.0\r\nConnection: close\r\n\r\n";
static ACTIVE_INSPECTIONS: Semaphore = Semaphore::const_new(2);

#[derive(Debug, Serialize)]
pub struct InspectionResponse {
    pub target: String,
    pub port: u16,
    pub check: String,
    pub status: String,
    pub protocol_evidence: String,
    pub os_assessment: String,
    pub observed_at: String,
    pub limitations: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_headers: Option<Vec<String>>,
}

#[derive(Clone, Copy)]
enum Check {
    Connect,
    HttpHead,
    HttpPreview,
    SshBanner,
}

fn validate(target: &str, port: u16, authorized: bool, check: &str) -> Result<(IpAddr, Check), String> {
    if !authorized {
        return Err("Explicit authorization is required for service inspection".into());
    }
    let check = match check {
        "connect" => Check::Connect,
        "http-head" => Check::HttpHead,
        "http-preview" => Check::HttpPreview,
        "ssh-banner" => Check::SshBanner,
        _ => return Err("Check must be connect, http-head, http-preview, or ssh-banner".into()),
    };
    if port == 0 || target.len() > 45 {
        return Err("Provide a literal IP address and a nonzero port".into());
    }
    let ip = target.parse::<IpAddr>().map_err(|_| "Provide a literal IP address (no hostname, URL, scope, or range)".to_string())?;
    let invalid = match ip {
        IpAddr::V4(ip) => ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast(),
        IpAddr::V6(ip) => {
            ip.is_unspecified() || ip.is_multicast() || ip.is_unicast_link_local()
                // Reject both mapped and deprecated IPv4-compatible representations.
                || (ip.to_ipv4().is_some() && !ip.is_loopback())
        }
    };
    if invalid {
        return Err("Unspecified, multicast, broadcast, IPv6 link-local, and embedded IPv4 targets are not allowed".into());
    }
    Ok((ip, check))
}

/// Restrict remote evidence to bounded printable ASCII; no terminal/control sequences.
fn sanitize(bytes: &[u8]) -> String {
    bytes.iter().take(MAX_EVIDENCE).map(|byte| match byte {
        0x20..=0x7e => *byte as char,
        _ => ' ',
    }).collect()
}

pub async fn inspect(target: String, port: u16, authorized: bool, check: String) -> Result<InspectionResponse, String> {
    inspect_with_limit(target, port, authorized, check, &ACTIVE_INSPECTIONS).await
}

async fn inspect_with_limit(target: String, port: u16, authorized: bool, check: String, active: &Semaphore) -> Result<InspectionResponse, String> {
    let (ip, selected) = validate(&target, port, authorized, &check)?;
    // No queue: saturation cannot extend the three-second network deadline.
    let _permit = active.try_acquire().map_err(|_| "Service inspection busy (maximum two active checks)".to_string())?;
    let result = tokio::time::timeout(TOTAL_TIMEOUT, observe(SocketAddr::new(ip, port), selected)).await;
    let (status, evidence, content_preview, response_headers) = match result {
        Ok(Ok(observation)) => (observation.status, observation.evidence, observation.content_preview, observation.response_headers),
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::ConnectionRefused => ("connection-refused", String::new(), None, None),
        Ok(Err(_)) => ("connection-error", String::new(), None, None),
        Err(_) => ("timeout", String::new(), None, None),
    };
    Ok(InspectionResponse {
        target: ip.to_string(),
        port,
        check,
        status: status.into(),
        protocol_evidence: evidence,
        os_assessment: "unavailable/unverified".into(),
        observed_at: chrono::Utc::now().to_rfc3339(),
        limitations: vec![
            "Single authorized TCP endpoint; total network deadline 3 seconds; at most 16384 bytes read; evidence/body limited to 4096 printable ASCII characters".into(),
            "Service text is unverified peer-supplied evidence, not an OS fingerprint; no OS assessment is available".into(),
            "No DNS, redirects, authentication, cookies, scripts, SSH commands, UDP, raw packets, or external processes; HTTP sends only HEAD / or GET /; SSH is passive".into(),
        ],
        content_preview,
        response_headers,
    })
}

struct Observation {
    status: &'static str,
    evidence: String,
    content_preview: Option<String>,
    response_headers: Option<Vec<String>>,
}

async fn observe(address: SocketAddr, check: Check) -> std::io::Result<Observation> {
    // SocketAddr ensures no DNS resolution or URL handling can occur.
    let mut stream = TcpStream::connect(address).await?;
    if matches!(check, Check::Connect) {
        return Ok(Observation { status: "connected", evidence: "TCP connection established; no protocol or OS identified".into(), content_preview: None, response_headers: None });
    }
    if matches!(check, Check::HttpHead | Check::HttpPreview) {
        stream.write_all(if matches!(check, Check::HttpPreview) { PREVIEW_REQUEST } else { HEAD_REQUEST }).await?;
    }
    let mut bytes = [0u8; MAX_READ];
    let mut used = 0;
    while used < MAX_READ {
        let count = stream.read(&mut bytes[used..]).await?;
        if count == 0 {
            break;
        }
        used += count;
        match check {
            Check::HttpHead => {
                if bytes[..used].windows(4).any(|part| part == b"\r\n\r\n") {
                    break;
                }
            }
            Check::SshBanner => {
                if ssh_banner(&bytes[..used]).is_some() {
                    break;
                }
            }
            Check::Connect => unreachable!(),
            Check::HttpPreview => {
                // Preview reads the bounded body; stop only at EOF or the
                // strict cap so content is available to the evidence card.
            }
        }
    }
    let data = &bytes[..used];
    match check {
        Check::HttpHead => {
            let end = data.windows(4).position(|part| part == b"\r\n\r\n").map(|n| n + 4).unwrap_or(data.len());
            let first_line = data.split(|byte| *byte == b'\n').next().unwrap_or_default();
            // Report only HTTP-shaped status lines; never infer a service from its port.
            let http = (first_line.starts_with(b"HTTP/1.0 ") || first_line.starts_with(b"HTTP/1.1 "))
                && first_line.get(9..12).is_some_and(|code| code.iter().all(u8::is_ascii_digit))
                && first_line.get(12).is_some_and(|b| *b == b' ' || *b == b'\r');
            Ok(Observation { status: if http { "http-response" } else { "unverified-response" }, evidence: sanitize(&data[..end]), content_preview: None, response_headers: None })
        }
        Check::HttpPreview => {
            let header_end = data.windows(4).position(|part| part == b"\r\n\r\n").map(|n| n + 4);
            let header_bytes = header_end.map(|end| &data[..end]).unwrap_or(data);
            let first_line = header_bytes.split(|byte| *byte == b'\n').next().unwrap_or_default();
            let http = (first_line.starts_with(b"HTTP/1.0 ") || first_line.starts_with(b"HTTP/1.1 "))
                && first_line.get(9..12).is_some_and(|code| code.iter().all(u8::is_ascii_digit))
                && first_line.get(12).is_some_and(|b| *b == b' ' || *b == b'\r');
            let headers = parse_headers(header_bytes);
            let body = header_end.map(|end| sanitize(&data[end..])).unwrap_or_default();
            Ok(Observation {
                status: if http { "http-response" } else { "unverified-response" },
                evidence: sanitize(header_bytes),
                content_preview: Some(body),
                response_headers: Some(headers),
            })
        }
        Check::SshBanner => match ssh_banner(data) {
            Some(banner) => Ok(Observation { status: "ssh-banner", evidence: sanitize(banner), content_preview: None, response_headers: None }),
            None => Ok(Observation { status: "no-ssh-banner", evidence: String::new(), content_preview: None, response_headers: None }),
        },
        Check::Connect => unreachable!(),
    }
}

fn parse_headers(data: &[u8]) -> Vec<String> {
    let mut remaining = MAX_EVIDENCE;
    data.split(|byte| *byte == b'\n').skip(1).take(64).filter_map(|line| {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() || remaining == 0 { return None; }
        let value = sanitize(&line[..line.len().min(remaining)]);
        remaining = remaining.saturating_sub(value.len());
        Some(value)
    }).collect()
}

fn ssh_banner(data: &[u8]) -> Option<&[u8]> {
    // A complete identification line is needed; arbitrary pre-banner text is not evidence.
    data.split_inclusive(|byte| *byte == b'\n').find(|line| {
        line.ends_with(b"\n") && line.len() <= 255
            && (line.starts_with(b"SSH-2.0-") || line.starts_with(b"SSH-1.99-") || line.starts_with(b"SSH-1.5-"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    async fn listener() -> (TcpListener, u16) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        (listener, port)
    }

    async fn local_inspect(port: u16, check: &str) -> InspectionResponse {
        inspect_with_limit("127.0.0.1".into(), port, true, check.into(), &Semaphore::new(2)).await.unwrap()
    }

    #[tokio::test]
    async fn http_head_sends_exact_request_and_does_not_follow_redirect() {
        let (listener, port) = listener().await;
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; HEAD_REQUEST.len()];
            socket.read_exact(&mut request).await.unwrap();
            assert_eq!(request, HEAD_REQUEST);
            socket.write_all(b"HTTP/1.0 302 Found\r\nLocation: http://invalid.example/\r\nServer: fixture\r\n\r\nBODY_SECRET").await.unwrap();
            let mut extra = [0; 1];
            assert_eq!(socket.read(&mut extra).await.unwrap(), 0);
            assert!(tokio::time::timeout(Duration::from_millis(50), listener.accept()).await.is_err());
        });
        let response = local_inspect(port, "http-head").await;
        assert_eq!(response.status, "http-response");
        assert!(response.protocol_evidence.contains("Server: fixture"));
        assert!(!response.protocol_evidence.contains("BODY_SECRET"));
        assert_eq!(response.os_assessment, "unavailable/unverified");
        assert_eq!(serde_json::to_value(response).unwrap().as_object().unwrap().len(), 8);
        fixture.await.unwrap();
    }

    #[tokio::test]
    async fn http_preview_sends_exact_get_and_returns_bounded_body_without_redirecting() {
        let (listener, port) = listener().await;
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; PREVIEW_REQUEST.len()];
            socket.read_exact(&mut request).await.unwrap();
            assert_eq!(request, PREVIEW_REQUEST);
            let mut response = b"HTTP/1.0 302 Found\r\nLocation: http://invalid.example/\r\nX-Fixture: yes\r\n\r\n".to_vec();
            response.extend(std::iter::repeat(b'X').take(MAX_READ));
            socket.write_all(&response).await.unwrap();
        });
        let response = local_inspect(port, "http-preview").await;
        assert_eq!(response.status, "http-response");
        assert_eq!(response.content_preview.as_deref().unwrap().len(), MAX_EVIDENCE);
        assert!(response.content_preview.as_deref().unwrap().bytes().all(|b| (0x20..=0x7e).contains(&b)));
        let headers = response.response_headers.as_ref().unwrap();
        assert!(headers.iter().any(|header| header == "Location: http://invalid.example/"));
        assert!(headers.iter().any(|header| header == "X-Fixture: yes"));
        fixture.await.unwrap();
    }

    #[tokio::test]
    async fn ssh_reads_passively_and_sanitizes_banner() {
        let (listener, port) = listener().await;
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            socket.write_all(b"Notice\r\nSSH-2.0-fixture\x1b[31m\r\n").await.unwrap();
            let mut incoming = [0; 32];
            // The client is allowed to close immediately after reaching the
            // read cap; loopback may report EOF or a one-byte buffered read
            // depending on scheduler timing. Either proves the inspector did
            // not wait for the fixture's EOF.
            let read_result = socket.read(&mut incoming).await;
            assert!(matches!(read_result, Ok(0 | 1) | Err(_)));
        });
        let response = local_inspect(port, "ssh-banner").await;
        assert_eq!(response.status, "ssh-banner");
        assert!(response.protocol_evidence.starts_with("SSH-2.0-fixture"));
        assert!(response.protocol_evidence.bytes().all(|b| (0x20..=0x7e).contains(&b)));
        fixture.await.unwrap();
    }

    #[tokio::test]
    async fn connect_is_passive_and_closed_port_is_reported() {
        let (listener, port) = listener().await;
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut incoming = [0; 1];
            let read_result = socket.read(&mut incoming).await;
            assert!(matches!(read_result, Ok(0 | 1) | Err(_)));
        });
        assert_eq!(local_inspect(port, "connect").await.status, "connected");
        fixture.await.unwrap();
        assert_eq!(local_inspect(port, "connect").await.status, "connection-refused");
    }

    #[tokio::test]
    async fn total_timeout_and_fail_fast_two_check_limit() {
        let (listener, port) = listener().await;
        let active = std::sync::Arc::new(Semaphore::new(2));
        let started = tokio::time::Instant::now();
        let mut tasks = Vec::new();
        let mut sockets = Vec::new();
        for _ in 0..2 {
            let active = active.clone();
            tasks.push(tokio::spawn(async move {
                inspect_with_limit("127.0.0.1".into(), port, true, "http-preview".into(), &active).await.unwrap()
            }));
            sockets.push(listener.accept().await.unwrap().0);
        }
        let busy_started = tokio::time::Instant::now();
        assert!(inspect_with_limit("127.0.0.1".into(), port, true, "connect".into(), &active).await.unwrap_err().contains("busy"));
        assert!(busy_started.elapsed() < Duration::from_millis(100));
        for task in tasks {
            assert_eq!(task.await.unwrap().status, "timeout");
        }
        // Allow scheduler overhead; the configured network deadline itself is exactly 3s.
        assert!(started.elapsed() >= TOTAL_TIMEOUT);
        assert!(started.elapsed() < Duration::from_millis(3500));
        assert_eq!(active.available_permits(), 2);
    }

    #[tokio::test]
    async fn authorization_and_invalid_inputs_never_connect() {
        let (listener, port) = listener().await;
        assert!(inspect("127.0.0.1".into(), port, false, "http-preview".into()).await.unwrap_err().contains("authorization"));
        for target in ["", "localhost", "http://127.0.0.1", "127.0.0.1:80", "127.0.0.1/32", " 127.0.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::", "ff02::1", "fe80::1", "febf::1", "fe80::1%lo", "::ffff:0.0.0.0", "::ffff:255.255.255.255", "::ffff:224.0.0.1", "::ffff:127.0.0.1", "::192.0.2.1"] {
            assert!(inspect(target.into(), port, true, "connect".into()).await.is_err(), "{target}");
        }
        assert!(inspect("127.0.0.1".into(), 0, true, "connect".into()).await.is_err());
        for check in ["aggressive", "HTTP-HEAD", "ssh", "", "connect "] {
            assert!(inspect("127.0.0.1".into(), port, true, check.into()).await.is_err());
        }
        assert!(validate("::1", port, true, "connect").is_ok());
        assert!(tokio::time::timeout(Duration::from_millis(50), listener.accept()).await.is_err());
    }

    #[tokio::test]
    async fn oversized_response_finishes_at_read_cap_and_bounds_all_strings() {
        let (listener, port) = listener().await;
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = b"HTTP/1.0 200 OK\r\nX-Large: ".to_vec();
            bytes.resize(MAX_READ, 0xff);
            socket.write_all(&bytes).await.unwrap();
            // The client may close immediately after reaching the read cap;
            // loopback can report EOF, one buffered byte, or a reset.
            let mut incoming = [0; 1];
            let read_result = socket.read(&mut incoming).await;
            assert!(matches!(read_result, Ok(0 | 1) | Err(_)));
        });
        let response = local_inspect(port, "http-head").await;
        assert_eq!(response.status, "http-response");
        assert_eq!(response.protocol_evidence.len(), MAX_EVIDENCE);
        let json = serde_json::to_value(response).unwrap();
        for value in json.as_object().unwrap().values() {
            if let Some(text) = value.as_str() {
                assert!(text.len() <= MAX_EVIDENCE);
                assert!(text.bytes().all(|b| (0x20..=0x7e).contains(&b)));
            }
            if let Some(values) = value.as_array() {
                for value in values {
                    assert!(value.as_str().unwrap().len() <= MAX_EVIDENCE);
                }
            }
        }
        fixture.await.unwrap();
    }
}
