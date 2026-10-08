use crate::models::WindowsEventEntry;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS, GetLastError};
#[cfg(windows)]
use windows_sys::Win32::System::EventLog::{
    EvtClose, EvtNext, EvtQuery, EvtRender, EvtQueryChannelPath, EvtQueryReverseDirection,
    EvtRenderEventXml,
};

const EVT_HANDLE_NULL: isize = 0;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Reads a substring between `<tag>` and `</tag>` (no nesting) from an XML fragment.
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let val = xml[start..end].trim();
    if val.is_empty() { None } else { Some(val.to_string()) }
}

/// Reads the `name="..."` attribute of `<tag ...>`.
fn extract_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let idx = xml.find(&open)?;
    let rest = &xml[idx + open.len()..];
    let end = rest.find(['>', ' '])?;
    let after = &rest[end..];
    let pat = format!("{}=\"", attr);
    let attr_idx = after.find(&pat)? + pat.len();
    let close_idx = after[attr_idx..].find('"')? + attr_idx;
    let val = &after[attr_idx..close_idx];
    if val.is_empty() { None } else { Some(val.to_string()) }
}

fn level_name(level: u32) -> String {
    match level {
        1 => "CRITICAL".to_string(),
        2 => "ERROR".to_string(),
        3 => "WARNING".to_string(),
        4 => "INFO".to_string(),
        5 => "VERBOSE".to_string(),
        _ => "INFO".to_string(),
    }
}

fn level_from_xml(xml: &str) -> u32 {
    extract_tag(xml, "Level")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(4)
}

fn message_from_xml(xml: &str) -> String {
    let mut parts = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<Data>") {
        let start = start + 6;
        let Some(end) = rest[start..].find("</Data>") else {
            break;
        };
        let value = rest[start..start + end].trim();
        if !value.is_empty() {
            parts.push(value.to_string());
        }
        rest = &rest[start + end + 7..];
    }
    let joined = parts.join(" | ");
    if joined.is_empty() {
        "No event data rendered (run elevated for full event content)".to_string()
    } else if joined.chars().count() > 500 {
        joined.chars().take(500).collect()
    } else {
        joined
    }
}

/// Queries real Windows Event Log (System + Security, last 7 days) via EvtQuery.
/// Returns an empty vec on any failure — never fabricates events.
#[cfg(windows)]
pub fn get_windows_event_logs(limit: usize) -> Vec<WindowsEventEntry> {
    const QUERY_XML: &str = r#"<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[(EventID &gt;= 1) and TimeCreated[timediff(@SystemTime) &lt;= 604800000]]]</Select>
  </Query>
  <Query Id="1" Path="Security">
    <Select Path="Security">*[System[TimeCreated[timediff(@SystemTime) &lt;= 604800000]]]</Select>
  </Query>
</QueryList>"#;

    let mut entries: Vec<WindowsEventEntry> = Vec::new();
    let query_wide = wide(QUERY_XML);

    unsafe {
        let query_handle = EvtQuery(
            EVT_HANDLE_NULL,
            std::ptr::null(),
            query_wide.as_ptr(),
            EvtQueryChannelPath | EvtQueryReverseDirection,
        );
        if query_handle == EVT_HANDLE_NULL {
            tracing::warn!(
                "⚠️ EvtQuery failed (last_error={}). Check channel permissions.",
                GetLastError()
            );
            return entries;
        }

        let batch = 8u32;
        let mut buffer: Vec<u16> = Vec::with_capacity(16 * 1024);
        let mut num_returned: u32 = 0;
        let mut rounds = 0;
        let max_rounds = (limit as u32 / batch + 3).max(3);

        loop {
            if entries.len() >= limit || rounds >= max_rounds {
                break;
            }
            rounds += 1;

            let mut handles = [EVT_HANDLE_NULL; 8];
            num_returned = 0;
            let ok = EvtNext(
                query_handle,
                batch,
                handles.as_mut_ptr(),
                150,
                0,
                &mut num_returned,
            );

            if ok == 0 {
                let err = GetLastError();
                if err == ERROR_NO_MORE_ITEMS {
                    break;
                }
                tracing::debug!("EvtNext stopped: last_error={}", err);
                break;
            }

            for i in 0..num_returned as usize {
                let event_handle = handles[i];
                if event_handle == EVT_HANDLE_NULL {
                    continue;
                }

                // EvtRender with growable buffer
                let mut buffer_used: u32 = 0;
                let mut property_count: u32 = 0;
                buffer.clear();
                let mut ok_render = EvtRender(
                    EVT_HANDLE_NULL,
                    event_handle,
                    EvtRenderEventXml,
                    0,
                    std::ptr::null_mut(),
                    &mut buffer_used,
                    &mut property_count,
                );
                if ok_render == 0 && GetLastError() == ERROR_INSUFFICIENT_BUFFER && buffer_used > 0 {
                    buffer.resize(buffer_used as usize, 0);
                    ok_render = EvtRender(
                        EVT_HANDLE_NULL,
                        event_handle,
                        EvtRenderEventXml,
                        buffer_used,
                        buffer.as_mut_ptr() as *mut _,
                        &mut buffer_used,
                        &mut property_count,
                    );
                }

                if ok_render != 0 {
                    let len = buffer.iter().position(|&u| u == 0).unwrap_or(buffer.len());
                    let xml = String::from_utf16_lossy(&buffer[..len]);
                    let timestamp = extract_attr(&xml, "TimeCreated", "SystemTime")
                        .map(|t| {
                            chrono::DateTime::parse_from_rfc3339(&t)
                                .map(|dt| dt.to_rfc3339())
                                .unwrap_or(t)
                        })
                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
                    let provider = extract_attr(&xml, "Provider", "Name")
                        .unwrap_or_else(|| "Microsoft-Windows".to_string());
                    let event_id = extract_tag(&xml, "EventID")
                        .and_then(|v| v.parse::<u32>().ok())
                        .unwrap_or(0);
                    let channel = extract_tag(&xml, "Channel").unwrap_or_default();
                    let level = level_name(level_from_xml(&xml));
                    let message = message_from_xml(&xml);

                    entries.push(WindowsEventEntry {
                        timestamp,
                        provider,
                        event_id,
                        level,
                        message,
                        channel,
                    });
                }
                EvtClose(event_handle);
            }

            if entries.len() >= limit {
                break;
            }
        }
        EvtClose(query_handle);
    }

    entries.truncate(limit);
    entries
}

#[cfg(not(windows))]
pub fn get_windows_event_logs(limit: usize) -> Vec<WindowsEventEntry> {
    if limit == 0 { return Vec::new(); }
    match collect_journal_logs(limit) {
        Ok(entries) if !entries.is_empty() => entries,
        Ok(_) => vec![collection_status("NOTICE", "No journal entries were returned; journal visibility may be restricted.")],
        Err(error) => {
            tracing::warn!(%error, "Linux journal collection unavailable");
            vec![collection_status("WARNING", &error)]
        }
    }
}

/// The compatibility API represents collection diagnostics explicitly, rather
/// than disguising them as kernel events. event_id=0 is not a Windows event ID.
#[cfg(not(windows))]
fn collection_status(level: &str, message: &str) -> WindowsEventEntry {
    WindowsEventEntry {
        timestamp: chrono::Utc::now().to_rfc3339(),
        provider: "NET0ZE log collector".into(), event_id: 0,
        level: level.into(), message: message.into(), channel: "collection-status".into(),
    }
}

#[cfg(not(windows))]
fn collect_journal_logs(limit: usize) -> Result<Vec<WindowsEventEntry>, String> {
    let mut command = std::process::Command::new("journalctl");
    command.args(["--no-pager", "--output=json", "--lines"])
        .arg(limit.min(1000).to_string()).env("SYSTEMD_COLORS", "0");
    let output = bounded_output(&mut command, std::time::Duration::from_secs(3))?;
    if !output.status.success() {
        return Err(format!("journalctl exited with {}: {}", output.status,
            String::from_utf8_lossy(&output.stderr).trim()));
    }
    let text = String::from_utf8(output.stdout).map_err(|_| "journalctl returned invalid UTF-8".to_string())?;
    let mut entries = Vec::new();
    for line in text.lines().rev().filter(|line| !line.trim().is_empty()) {
        entries.push(parse_journal_entry(line).ok_or_else(|| "journalctl returned an unsupported or malformed record".to_string())?);
    }
    if !output.stderr.is_empty() {
        entries.insert(0, collection_status("WARNING", &format!("journalctl diagnostic: {}", String::from_utf8_lossy(&output.stderr).trim())));
    }
    entries.truncate(limit.min(1000));
    Ok(entries)
}

/// Concurrent bounded pipe readers prevent pipe deadlocks; deadline includes
/// process execution and pipe draining. The child is killed/reaped on failure.
#[cfg(not(windows))]
fn bounded_output(command: &mut std::process::Command, timeout: std::time::Duration) -> Result<std::process::Output, String> {
    use std::{io::Read, process::Stdio, sync::mpsc, time::Instant};
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("Cannot start journalctl: {e}"))?;
    let (sender, receiver) = mpsc::channel();
    let pipes: Vec<(bool, Box<dyn Read + Send>, u64)> = vec![
        (true, Box::new(child.stdout.take().unwrap()), 8 * 1024 * 1024),
        (false, Box::new(child.stderr.take().unwrap()), 16 * 1024),
    ];
    for (stdout, pipe, cap) in pipes {
        let sender = sender.clone();
        std::thread::spawn(move || {
            let mut data = Vec::new();
            let result = pipe.take(cap + 1).read_to_end(&mut data)
                .map_err(|e| e.to_string()).and_then(|_| {
                    if data.len() as u64 > cap { Err("journalctl output exceeded collection limit".into()) } else { Ok(data) }
                });
            let _ = sender.send((stdout, result));
        });
    }
    drop(sender);
    let deadline = Instant::now() + timeout;
    let result = (|| {
        let mut stdout = None;
        let mut stderr = None;
        loop {
            while let Ok((is_stdout, data)) = receiver.try_recv() {
                if is_stdout { stdout = Some(data?); } else { stderr = Some(data?); }
            }
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                if stdout.is_some() && stderr.is_some() {
                    return Ok(std::process::Output { status, stdout: stdout.take().unwrap(), stderr: stderr.take().unwrap() });
                }
            }
            if Instant::now() >= deadline { return Err("journalctl collection timed out".into()); }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    })();
    if result.is_err() { let _ = child.kill(); let _ = child.wait(); }
    result
}

#[cfg(not(windows))]
fn parse_journal_entry(line: &str) -> Option<WindowsEventEntry> {
    let record: serde_json::Value = serde_json::from_str(line).ok()?;
    let micros = record["__REALTIME_TIMESTAMP"].as_str()?.parse::<i64>().ok()?;
    Some(WindowsEventEntry {
        timestamp: chrono::DateTime::from_timestamp_micros(micros)?.to_rfc3339(),
        provider: record["SYSLOG_IDENTIFIER"].as_str().or(record["_COMM"].as_str()).unwrap_or("journal").to_string(),
        event_id: 0,
        level: match record["PRIORITY"].as_str() {
            Some("0" | "1" | "2") => "CRITICAL", Some("3") => "ERROR", Some("4") => "WARNING",
            Some("5") => "NOTICE", Some("6") => "INFO", Some("7") => "DEBUG", _ => "UNKNOWN",
        }.to_string(),
        message: journal_message(&record["MESSAGE"] )?,
        channel: record["_SYSTEMD_UNIT"].as_str().unwrap_or("journal").to_string(),
    })
}

#[cfg(not(windows))]
fn journal_message(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() { return Some(text.to_string()); }
    // journald JSON uses byte arrays for non-printable/binary values.
    let bytes: Option<Vec<u8>> = value.as_array()?.iter()
        .map(|v| v.as_u64().and_then(|n| u8::try_from(n).ok())).collect();
    Some(String::from_utf8_lossy(&bytes?).into_owned())
}

#[cfg(all(test, not(windows)))]
mod journal_tests {
    #[test]
    fn collector_times_out_and_reports_failures_explicitly() {
        let start = std::time::Instant::now();
        let result = super::bounded_output(std::process::Command::new("sleep").arg("5"), std::time::Duration::from_millis(50));
        assert!(result.unwrap_err().contains("timed out"));
        assert!(start.elapsed() < std::time::Duration::from_secs(2));
        let status = super::collection_status("WARNING", "journal unavailable");
        assert_eq!(status.channel, "collection-status");
        assert_eq!(status.provider, "NET0ZE log collector");
    }
    #[test]
    fn collector_bounds_output_and_preserves_exit_status() {
        let result = super::bounded_output(&mut std::process::Command::new("false"), std::time::Duration::from_secs(1)).unwrap();
        assert!(!result.status.success());
        let result = super::bounded_output(&mut std::process::Command::new("yes"), std::time::Duration::from_secs(2));
        assert!(result.unwrap_err().contains("exceeded collection limit"));
    }
    #[test]
    fn journal_binary_message_and_unknown_priority_are_preserved() {
        let event = super::parse_journal_entry(r#"{"__REALTIME_TIMESTAMP":"1728000000000000","MESSAGE":[65,0,66]}"#).unwrap();
        assert_eq!(event.message, "A\0B");
        assert_eq!(event.level, "UNKNOWN");
        assert!(super::parse_journal_entry(r#"{"MESSAGE":"missing timestamp"}"#).is_none());
    }
    #[test]
    fn structured_journal_preserves_severity_and_message() {
        let event = super::parse_journal_entry(r#"{"__REALTIME_TIMESTAMP":"1728000000000000","PRIORITY":"3","SYSLOG_IDENTIFIER":"fixture","MESSAGE":"multi word\nmessage"}"#).unwrap();
        assert_eq!(event.level, "ERROR");
        assert_eq!(event.message, "multi word\nmessage");
        assert!(super::parse_journal_entry("-- No entries --").is_none());
    }
}
