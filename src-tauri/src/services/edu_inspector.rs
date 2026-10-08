use crate::models::EduExplanation;

pub fn sanitize_string(val: &str) -> String {
    val.replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

pub fn get_field_explanation(field_id: &str, current_value: &str) -> EduExplanation {
    let clean_val = sanitize_string(current_value);

    match field_id {
        "src_ip" | "source_ip" => EduExplanation {
            field_id: "source_ip".to_string(),
            title: "Source IP Address".to_string(),
            category: "NETWORK".to_string(),
            short_description: "The IPv4 or IPv6 address initiating the network communication flow.".to_string(),
            detailed_explanation: "In network security analysis, the source IP identifies the host endpoint that originated the network request. Tracking source IPs allows analysts to detect host-based anomalies, port scanning sweeps, or unauthorized network activity.".to_string(),
            current_value: clean_val.clone(),
            interpretation: format!("Observed traffic originating from host address {}.", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("Flow source IP address: {}", clean_val)],
            related_entities: vec!["destination_ip".to_string(), "source_port".to_string()],
            analyst_next_steps: vec![
                "Inspect total active flows for this source host.".to_string(),
                "Check if this host is internal or external.".to_string(),
                "Review correlated detection findings for this IP.".to_string(),
            ],
        },
        "dst_ip" | "destination_ip" => EduExplanation {
            field_id: "destination_ip".to_string(),
            title: "Destination IP Address".to_string(),
            category: "NETWORK".to_string(),
            short_description: "The target IPv4 or IPv6 address receiving the network communication.".to_string(),
            detailed_explanation: "The destination IP identifies the target server or system receiving the traffic. Monitoring destination IPs helps identify critical infrastructure targets, external C2 servers, or target server density during scanning.".to_string(),
            current_value: clean_val.clone(),
            interpretation: format!("Observed communication targeted toward host address {}.", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("Flow destination IP address: {}", clean_val)],
            related_entities: vec!["source_ip".to_string(), "destination_port".to_string()],
            analyst_next_steps: vec![
                "Verify whether destination IP is a known internal service.".to_string(),
                "Check reputation or threat intelligence feeds for external IPs.".to_string(),
            ],
        },
        "dst_port" | "destination_port" => {
            let port_num: u16 = clean_val.parse().unwrap_or(0);
            let context = match port_num {
                443 => "Port 443 is standard for HTTPS/TLS encrypted web traffic. Note: Traffic is not guaranteed to be HTTPS merely because port 443 is used.",
                445 => "Port 445 is used for Microsoft SMB2 (Server Message Block) file sharing and IPC RPC. SMB activity is standard in Windows environments but warrants monitoring during unexpected spikes.",
                80 => "Port 80 is standard for unencrypted HTTP web traffic.",
                3389 => "Port 3389 is standard for Microsoft RDP (Remote Desktop Protocol).",
                22 => "Port 22 is standard for SSH (Secure Shell) remote access.",
                53 => "Port 53 is standard for DNS (Domain Name System) queries.",
                _ => "Port number observed in network session.",
            };

            EduExplanation {
                field_id: "destination_port".to_string(),
                title: format!("Destination Port {}", port_num),
                category: "NETWORK".to_string(),
                short_description: format!("Target service transport port: {}.", port_num),
                detailed_explanation: context.to_string(),
                current_value: clean_val.clone(),
                interpretation: format!("Target port {} observed in flow. {}", port_num, context),
                status_level: "OBSERVED".to_string(),
                evidence: vec![format!("Observed destination port {}", port_num)],
                related_entities: vec!["protocol".to_string(), "destination_ip".to_string()],
                analyst_next_steps: vec![
                    "Verify if target port aligns with expected service configuration.".to_string(),
                    "Check if multiple unique destination ports were contacted by the source.".to_string(),
                ],
            }
        }
        "ja4" => EduExplanation {
            field_id: "ja4".to_string(),
            title: "JA4 Network Fingerprint".to_string(),
            category: "JA4_FINGERPRINT".to_string(),
            short_description: "A 36-character human-readable fingerprint representing TLS ClientHello features.".to_string(),
            detailed_explanation: "JA4 creates a deterministic fingerprint of TLS client implementations by inspecting ClientHello parameters (protocol, TLS version, SNI indicator, cipher count, extension count, ALPN, cipher hash, and extension hash). GREASE values are filtered out to ensure consistency.".to_string(),
            current_value: clean_val.clone(),
            interpretation: format!("Provided TLS ClientHello fingerprint: {}. Feed-match evidence is not supplied to this explanation.", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("JA4 fingerprint: {}", clean_val)],
            related_entities: vec!["tls_version".to_string(), "sni".to_string(), "alpn".to_string()],
            analyst_next_steps: vec![
                "Inspect related TLS flows sharing this JA4 fingerprint.".to_string(),
                "Check SNI domain name associated with this fingerprint.".to_string(),
                "Review correlated detection findings.".to_string(),
            ],
        },
        "tcp_state" => EduExplanation {
            field_id: "tcp_state".to_string(),
            title: "TCP State Machine Indicator".to_string(),
            category: "TCP".to_string(),
            short_description: "The current state of the 4-way TCP connection handshake or termination.".to_string(),
            detailed_explanation: "TCP connection states track the lifecycle of a connection (SYN_SENT, ESTABLISHED, FIN_WAIT, RST). An RST (Reset) flag indicates an immediate connection abort or port rejection signal, while ESTABLISHED indicates active bidirectional data transfer.".to_string(),
            current_value: clean_val.clone(),
            interpretation: format!("Observed TCP connection state: {}", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("TCP State: {}", clean_val)],
            related_entities: vec!["protocol".to_string(), "packet_count".to_string()],
            analyst_next_steps: vec![
                "Review flow duration and byte volume.".to_string(),
                "Check if connection terminated normally or via RST.".to_string(),
            ],
        },
        "pid" | "process" => EduExplanation {
            field_id: "process".to_string(),
            title: "Process Attribution & PID Correlation".to_string(),
            category: "SYSTEM_INSPECTOR".to_string(),
            short_description: "Local Windows Process Identifier (PID) and owning executable name.".to_string(),
            detailed_explanation: "Process attribution links network flow observations to the local Windows process holding the active TCP socket via GetExtendedTcpTable. This provides endpoint visibility into process origin.".to_string(),
            current_value: clean_val.clone(),
            interpretation: format!("Observed local process attribution: {}.", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("Process: {}", clean_val)],
            related_entities: vec!["tcp_state".to_string(), "source_ip".to_string()],
            analyst_next_steps: vec![
                "Verify if process executable is located in a standard Windows directory.".to_string(),
                "Review active socket connections owned by this PID.".to_string(),
            ],
        },
        _ => EduExplanation {
            field_id: sanitize_string(field_id),
            title: format!("Field Explanation: {}", sanitize_string(field_id)),
            category: "GENERAL".to_string(),
            short_description: format!("Observed network telemetry field: {}", sanitize_string(field_id)),
            detailed_explanation: format!("NET0ZE tracks {} as part of operational traffic analysis.", sanitize_string(field_id)),
            current_value: clean_val.clone(),
            interpretation: format!("Observed value: {}", clean_val),
            status_level: "OBSERVED".to_string(),
            evidence: vec![format!("{}: {}", sanitize_string(field_id), clean_val)],
            related_entities: vec![],
            analyst_next_steps: vec!["Review related flow records and detection findings.".to_string()],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitization() {
        let dirty = "<script>alert('xss')</script>";
        let clean = sanitize_string(dirty);
        assert!(!clean.contains('<'));
        assert!(!clean.contains('>'));
    }

    #[test]
    fn test_port_443_explanation() {
        let exp = get_field_explanation("dst_port", "443");
        assert_eq!(exp.title, "Destination Port 443");
        assert!(exp.detailed_explanation.contains("HTTPS/TLS"));
        assert_eq!(exp.status_level, "OBSERVED");
    }

    #[test]
    fn test_ja4_explanation() {
        let exp = get_field_explanation("ja4", "t13d8daaf6152771_a1b2_c3d4");
        assert_eq!(exp.status_level, "OBSERVED");
        assert!(!exp.interpretation.contains("matches configured"));
    }
}
