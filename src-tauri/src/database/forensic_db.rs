use crate::models::{
    ForensicQueryResult, SavedForensicQuery,
};
use crate::services::query_validator::validate_sql_query;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static FORENSIC_QUERY_MUTEX: Mutex<()> = Mutex::new(());

fn bound_query(conn: &rusqlite::Connection, duration: Duration) {
    use rusqlite::limits::Limit;
    conn.set_limit(Limit::SQLITE_LIMIT_LENGTH, 1024 * 1024);
    conn.set_limit(Limit::SQLITE_LIMIT_SQL_LENGTH, 64 * 1024);
    conn.set_limit(Limit::SQLITE_LIMIT_COLUMN, 64);
    conn.set_limit(Limit::SQLITE_LIMIT_EXPR_DEPTH, 100);
    conn.set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0);
    let started = Instant::now();
    // Check inside SQLite VM execution, including work before the first row.
    conn.progress_handler(1000, Some(move || started.elapsed() >= duration));
}

pub fn execute_forensic_query(
    sql_query: &str,
    max_rows: Option<usize>,
) -> Result<ForensicQueryResult, String> {
    // 1. Enforce single concurrent query lock
    let _guard = FORENSIC_QUERY_MUTEX
        .lock()
        .map_err(|_| "Concurrent forensic query locked by another session".to_string())?;

    // 2. Validate Security Model (READ-ONLY check)
    let val_res = validate_sql_query(sql_query);
    if !val_res.is_valid {
        return Err(val_res
            .error_message
            .unwrap_or_else(|| "Invalid or non-read-only query".to_string()));
    }

    let start_time = Instant::now();
    let limit_rows = max_rows.unwrap_or(1000).min(1000);

    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    if !db_path.exists() {
        return Err("Local telemetry database is unavailable".to_string());
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("Failed to open read-only database: {}", e))?;
    bound_query(&conn, Duration::from_secs(10));

    let mut stmt = conn
        .prepare(sql_query)
        .map_err(|e| format!("SQL Syntax Error: {}", e))?;

    let col_count = stmt.column_count();
    let mut col_names = Vec::with_capacity(col_count);
    for i in 0..col_count {
        col_names.push(stmt.column_name(i).unwrap_or("?").to_string());
    }

    let mut rows_out = Vec::new();
    let mut truncated = false;
    let mut returned_bytes = 0usize;

    let mut query_rows = stmt
        .query([])
        .map_err(|e| format!("Query execution failure: {}", e))?;

    while let Some(row) = query_rows.next().map_err(|e| e.to_string())? {
        if start_time.elapsed().as_secs() > 10 {
            return Err("Query execution timeout (Exceeded 10s safety threshold)".to_string());
        }

        if rows_out.len() >= limit_rows {
            truncated = true;
            break;
        }

        let mut row_vals = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let val_str: String = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => "NULL".to_string(),
                Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                Ok(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                Ok(rusqlite::types::ValueRef::Text(s)) => {
                    String::from_utf8_lossy(s).to_string()
                }
                Ok(rusqlite::types::ValueRef::Blob(b)) => format!("<BLOB {}B>", b.len()),
                Err(_) => "ERR".to_string(),
            };
            row_vals.push(val_str);
        }
        let row_bytes: usize = row_vals.iter().map(String::len).sum();
        if returned_bytes.saturating_add(row_bytes) > 8 * 1024 * 1024 {
            truncated = true;
            break;
        }
        returned_bytes += row_bytes;
        rows_out.push(row_vals);
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    let count = rows_out.len();

    // Log query execution to audit trail
    let _ = log_forensic_audit(sql_query, elapsed_ms, count, "SUCCESS", None);

    Ok(ForensicQueryResult {
        execution_time_ms: elapsed_ms,
        row_count: count,
        columns: col_names,
        rows: rows_out,
        truncated,
    })
}

pub fn get_saved_queries() -> Result<Vec<SavedForensicQuery>, String> {
    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS forensic_saved_queries (
            query_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            sql TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT query_id, name, description, sql, created_at FROM forensic_saved_queries ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(SavedForensicQuery {
                query_id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                sql: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows {
        if let Ok(q) = item {
            list.push(q);
        }
    }
    Ok(list)
}

pub fn save_forensic_query(name: &str, description: &str, sql: &str) -> Result<bool, String> {
    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS forensic_saved_queries (
            query_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            sql TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let qid = format!("sq_{}", current_ts_ms());
    let now_str = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO forensic_saved_queries (query_id, name, description, sql, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![qid, name, description, sql, now_str],
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

fn log_forensic_audit(
    query_text: &str,
    elapsed_ms: u64,
    row_count: usize,
    status: &str,
    error_msg: Option<&str>,
) -> Result<(), String> {
    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS forensic_audit_log (
            audit_id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            query_text TEXT NOT NULL,
            execution_time_ms INTEGER NOT NULL,
            row_count INTEGER NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let aid = format!("aud_{}", current_ts_ms());
    let now_str = chrono::Utc::now().to_rfc3339();

    let _ = conn.execute(
        "INSERT INTO forensic_audit_log (audit_id, timestamp, query_text, execution_time_ms, row_count, status, error_message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![aid, now_str, query_text, elapsed_ms, row_count, status, error_msg],
    );

    Ok(())
}

fn current_ts_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod safety_tests {
    use super::*;

    #[test]
    fn deadline_interrupts_sqlite_work_before_its_first_row() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        bound_query(&conn, Duration::ZERO);
        let before = Instant::now();
        let result = conn.query_row(
            "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000000) SELECT sum(x) FROM n",
            [], |row| row.get::<_, i64>(0));
        assert!(matches!(result, Err(rusqlite::Error::SqliteFailure(error, _))
            if error.code == rusqlite::ErrorCode::OperationInterrupted));
        assert!(before.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn result_value_and_column_limits_prevent_unbounded_allocations() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        bound_query(&conn, Duration::from_secs(10));
        let result = conn.query_row("SELECT randomblob(2097152)", [], |row| row.get::<_, Vec<u8>>(0));
        assert!(result.is_err());
        let sql = format!("SELECT {}", vec!["1"; 65].join(","));
        assert!(conn.prepare(&sql).is_err());
        assert_eq!(conn.query_row("SELECT 1", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
    }

    #[test]
    fn execute_forensic_query_blocks_malicious_sql_before_prepare() {
        // Regression for strix finding vuln-0001 (SQL injection via forensic query
        // persistence replay): even if a tampered/stale saved-query row held bad SQL,
        // the execute path must re-validate the statement before preparing anything.
        let malicious = [
            "SELECT src_ip FROM flow_records; DELETE FROM flow_records",
            "SELECT src_ip FROM flow_records; PRAGMA journal_mode=WAL",
            "ATTACH '/tmp/netoze-attack.db' AS e; SELECT * FROM e.t",
            "UPDATE flow_records SET src_ip='1.2.3.4'",
            "SELECT load_extension('x')",
        ];
        for sql in malicious {
            let res = execute_forensic_query(sql, Some(10));
            assert!(res.is_err(), "execute path must reject: {sql}");
        }
    }
}
