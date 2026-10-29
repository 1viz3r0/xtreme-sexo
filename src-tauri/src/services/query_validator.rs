use crate::models::{ForensicColumnMeta, ForensicTableSchema, ForensicTemplate, QueryValidationResult};

pub fn validate_sql_query(raw_sql: &str) -> QueryValidationResult {
    if raw_sql.len() > 64 * 1024 {
        return QueryValidationResult { is_valid: false, is_read_only: false,
            statement_type: "TOO_LARGE".into(), error_message: Some("Query exceeds 64 KiB".into()) };
    }
    let trimmed = raw_sql.trim();

    if trimmed.is_empty() {
        return QueryValidationResult {
            is_valid: false,
            is_read_only: false,
            statement_type: "EMPTY".to_string(),
            error_message: Some("Query string is empty".to_string()),
        };
    }

    // 1. Statement chaining check (reject multiple queries split by semicolon)
    let statements: Vec<&str> = trimmed
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if statements.len() > 1 {
        return QueryValidationResult {
            is_valid: false,
            is_read_only: false,
            statement_type: "MULTIPLE_STATEMENTS".to_string(),
            error_message: Some("Multiple SQL statements in a single query are strictly prohibited".to_string()),
        };
    }

    let upper_sql = trimmed.to_uppercase();

    // 2. Reject forbidden write/admin/destructive keywords
    let forbidden_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
        "ATTACH", "DETACH", "COPY", "EXPORT", "IMPORT", "INSTALL", "LOAD",
        "CALL", "PRAGMA", "SET", "RESET", "RENAME", "GRANT", "REVOKE",
    ];

    for kw in &forbidden_keywords {
        let pattern = format!(" {} ", kw);
        if upper_sql.starts_with(kw) || upper_sql.contains(&pattern) {
            return QueryValidationResult {
                is_valid: false,
                is_read_only: false,
                statement_type: kw.to_string(),
                error_message: Some(format!("Forbidden SQL keyword '{}' detected. Analyst queries must be strictly READ-ONLY.", kw)),
            };
        }
    }

    // 3. Reject dangerous filesystem / network / extension functions
    let forbidden_functions = [
        "READ_TEXT", "READ_BLOB", "WRITE_CSV", "READ_CSV", "PARQUET_SCAN",
        "HTTP_GET", "HTTP_POST", "SYSTEM_EXEC", "SHELL", "COPY_TO",
        "LOAD_EXTENSION", "LOAD_DATA", "LOAD_FILE",
    ];

    for fn_name in &forbidden_functions {
        if upper_sql.contains(fn_name) {
            return QueryValidationResult {
                is_valid: false,
                is_read_only: false,
                statement_type: "FORBIDDEN_FUNCTION".to_string(),
                error_message: Some(format!("Forbidden function '{}' detected. Filesystem access is strictly prohibited.", fn_name)),
            };
        }
    }

    // 4. Require query to start with SELECT or WITH
    if !upper_sql.starts_with("SELECT") && !upper_sql.starts_with("WITH") {
        return QueryValidationResult {
            is_valid: false,
            is_read_only: false,
            statement_type: "UNKNOWN".to_string(),
            error_message: Some("Forensic queries must begin with SELECT or WITH statements".to_string()),
        };
    }

    let stmt_type = if upper_sql.starts_with("WITH") {
        "WITH_CTE".to_string()
    } else {
        "SELECT".to_string()
    };

    QueryValidationResult {
        is_valid: true,
        is_read_only: true,
        statement_type: stmt_type,
        error_message: None,
    }
}

pub fn get_prebuilt_templates() -> Vec<ForensicTemplate> {
    vec![
        ForensicTemplate {
            template_id: "tmpl_01".to_string(),
            title: "Top Source IPs by Flow Count".to_string(),
            description: "Identifies top internal or external source hosts initiating network communication flows.".to_string(),
            category: "FLOW_ANALYSIS".to_string(),
            sql: "SELECT src_ip, COUNT(*) as flow_count, SUM(packet_count) as total_packets, SUM(total_bytes) as total_bytes FROM flow_records GROUP BY src_ip ORDER BY flow_count DESC LIMIT 50".to_string(),
        },
        ForensicTemplate {
            template_id: "tmpl_02".to_string(),
            title: "Top Destination Ports".to_string(),
            description: "Analyzes target service port distribution across active flow records.".to_string(),
            category: "PORT_ANALYSIS".to_string(),
            sql: "SELECT dst_port, protocol, COUNT(*) as flow_count, SUM(packet_count) as total_packets FROM flow_records GROUP BY dst_port, protocol ORDER BY flow_count DESC LIMIT 50".to_string(),
        },
        ForensicTemplate {
            template_id: "tmpl_03".to_string(),
            title: "High-Severity Detection Findings".to_string(),
            description: "Lists active detection findings with HIGH or CRITICAL severity classifications.".to_string(),
            category: "DETECTION_ANALYSIS".to_string(),
            sql: "SELECT finding_id, rule_id, severity, title, source_ip, destination_ip, evidence FROM detection_findings WHERE severity IN ('HIGH', 'CRITICAL') ORDER BY timestamp DESC LIMIT 50".to_string(),
        },
        ForensicTemplate {
            template_id: "tmpl_04".to_string(),
            title: "JA4 Fingerprints Frequency".to_string(),
            description: "Aggregates TLS ClientHello JA4 fingerprints observed across encrypted sessions.".to_string(),
            category: "JA4_ANALYSIS".to_string(),
            sql: "SELECT fingerprint, tls_version, alpn, src_ip, dst_ip, COUNT(*) as frequency FROM ja4_fingerprints GROUP BY fingerprint ORDER BY frequency DESC LIMIT 50".to_string(),
        },
        ForensicTemplate {
            template_id: "tmpl_05".to_string(),
            title: "Suspicious SMB (Port 445) Sessions".to_string(),
            description: "Filters flows directed toward Microsoft SMB2 (Port 445) file sharing.".to_string(),
            category: "PROTOCOL_ANALYSIS".to_string(),
            sql: "SELECT flow_id, src_ip, dst_ip, packet_count, total_bytes, tcp_state FROM flow_records WHERE dst_port = 445 ORDER BY packet_count DESC LIMIT 50".to_string(),
        },
    ]
}

pub fn get_schema_metadata() -> Vec<ForensicTableSchema> {
    vec![
        ForensicTableSchema {
            table_name: "flow_records".to_string(),
            description: "Canonical 5-tuple network flow records persisted by FlowEngine".to_string(),
            columns: vec![
                ForensicColumnMeta { name: "flow_id".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "src_ip".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "dst_ip".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "src_port".to_string(), data_type: "INTEGER".to_string() },
                ForensicColumnMeta { name: "dst_port".to_string(), data_type: "INTEGER".to_string() },
                ForensicColumnMeta { name: "protocol".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "packet_count".to_string(), data_type: "INTEGER".to_string() },
                ForensicColumnMeta { name: "total_bytes".to_string(), data_type: "INTEGER".to_string() },
                ForensicColumnMeta { name: "tcp_state".to_string(), data_type: "TEXT".to_string() },
            ],
        },
        ForensicTableSchema {
            table_name: "ja4_fingerprints".to_string(),
            description: "Observed TLS ClientHello JA4 network fingerprints".to_string(),
            columns: vec![
                ForensicColumnMeta { name: "fingerprint".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "flow_id".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "tls_version".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "alpn".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "src_ip".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "dst_ip".to_string(), data_type: "TEXT".to_string() },
            ],
        },
        ForensicTableSchema {
            table_name: "detection_findings".to_string(),
            description: "Detections generated by native RuleEvaluator engine".to_string(),
            columns: vec![
                ForensicColumnMeta { name: "finding_id".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "rule_id".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "severity".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "source_ip".to_string(), data_type: "TEXT".to_string() },
                ForensicColumnMeta { name: "destination_ip".to_string(), data_type: "TEXT".to_string() },
            ],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_text_is_bounded_before_normalization() {
        assert!(!validate_sql_query(&format!("SELECT '{}'", "x".repeat(64 * 1024))).is_valid);
    }

    #[test]
    fn test_valid_select_query() {
        let res = validate_sql_query("SELECT src_ip, dst_ip FROM flow_records WHERE dst_port = 443");
        assert!(res.is_valid);
        assert!(res.is_read_only);
    }

    #[test]
    fn test_reject_insert() {
        let res = validate_sql_query("INSERT INTO flow_records VALUES ('1', '2')");
        assert!(!res.is_valid);
        assert_eq!(res.statement_type, "INSERT");
    }

    #[test]
    fn test_reject_drop_table() {
        let res = validate_sql_query("DROP TABLE flow_records");
        assert!(!res.is_valid);
    }

    #[test]
    fn test_reject_multiple_statements() {
        let res = validate_sql_query("SELECT * FROM flow_records; DROP TABLE ja4_fingerprints;");
        assert!(!res.is_valid);
        assert_eq!(res.statement_type, "MULTIPLE_STATEMENTS");
    }

    #[test]
    fn rejects_extension_and_bulk_loader_functions() {
        // rusqlite also disables load_extension at connect time, but the detection
        // layer must name it so read-only forensics never even attempt it.
        for sql in [
            "SELECT load_extension('x')",
            "SELECT * FROM flow_records WHERE dst_port = LOAD_EXTENSION('x')",
            "SELECT load_data('x')",
            "SELECT load_file('x')",
        ] {
            let res = validate_sql_query(sql);
            assert!(!res.is_valid, "validator must reject: {sql}");
        }
    }
}
