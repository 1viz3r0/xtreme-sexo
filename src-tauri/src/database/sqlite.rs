use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::PathBuf;

/// Resolves platform-appropriate AppData directory for NET0ZE.
/// Portable builds (feature "portable") use their own isolated directory so
/// concurrent instances / the installed build never collide on the databases.
pub fn get_app_dir() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push(if cfg!(feature = "portable") { "NET0ZE-Portable" } else { "NET0ZE" });
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

/// Initializes SQLite database `netoze_app.db` and runs initial migrations
pub fn init_sqlite() -> Result<PathBuf> {
    let mut db_path = get_app_dir();
    db_path.push("netoze_app.db");

    let conn = Connection::open(&db_path)?;

    // Table 1: Application Config
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Table 2: Local User Profiles
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Table 3: IOC Catalog
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ioc_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ioc_type TEXT NOT NULL,
            ioc_value TEXT NOT NULL UNIQUE,
            severity TEXT NOT NULL,
            source TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Table 4: Detection Rules
    conn.execute(
        "CREATE TABLE IF NOT EXISTS detection_rules (
            rule_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            predicate TEXT NOT NULL,
            severity TEXT NOT NULL,
            technique_id TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Table 5: Lab Progress
    conn.execute(
        "CREATE TABLE IF NOT EXISTS lab_progress (
            lab_id TEXT PRIMARY KEY,
            step_completed INTEGER NOT NULL DEFAULT 0,
            score INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Table 6: Tamper-Evident SHA-256 Audit Log
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            resource TEXT NOT NULL,
            prev_hash TEXT NOT NULL,
            curr_hash TEXT NOT NULL
        )",
        [],
    )?;

    // Seed default app_config entries
    conn.execute(
        "INSERT OR IGNORE INTO app_config (key, value) VALUES 
        ('theme', 'dark_glass'),
        ('capture_status', 'STOPPED'),
        ('selected_interface', 'eth0'),
        ('app_mode', 'LIVE')",
        [],
    )?;

    initialize_phase11_tables(&conn)?;
    tracing::info!("✅ SQLite Database initialized at {:?}", db_path);
    Ok(db_path)
}

// ---------------------------------------------------------------
// PHASE 11: LIVE INTEL TABLES (geoip cache, threat matches, devices,
// port scan results, DNS telemetry)
// ---------------------------------------------------------------

pub fn open_conn() -> rusqlite::Result<Connection> {
    // Read paths can be exercised before the desktop startup migration (for
    // example by a standalone integration test). Ensure the same schema
    // contract before handing out a connection instead of returning an empty
    // database that later fails with "no such table".
    init_sqlite()?;
    let db_path = get_app_dir().join("netoze_app.db");
    Connection::open(db_path)
}

fn ensure_phase11_tables(conn: &Connection) {
    if let Err(error) = initialize_phase11_tables(conn) {
        tracing::warn!("Local intel schema unavailable: {}", error);
    }
}

pub(crate) fn initialize_phase11_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS geoip_cache (
            ip TEXT PRIMARY KEY,
            country TEXT NOT NULL,
            country_code TEXT NOT NULL,
            city TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            asn TEXT,
            org TEXT,
            source TEXT NOT NULL,
            resolved_at INTEGER NOT NULL
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS threat_matches (
            ip TEXT NOT NULL,
            indicator_type TEXT NOT NULL,
            feed TEXT NOT NULL,
            severity TEXT NOT NULL,
            feed_first_seen TEXT,
            feed_last_seen TEXT,
            matched_at INTEGER NOT NULL,
            PRIMARY KEY (ip, feed)
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS devices (
            ip TEXT PRIMARY KEY,
            mac TEXT NOT NULL,
            hostname TEXT,
            vendor TEXT,
            interface TEXT,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            is_self INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS port_scan (
            ip TEXT NOT NULL,
            port INTEGER NOT NULL,
            protocol TEXT NOT NULL,
            state TEXT NOT NULL,
            service TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            PRIMARY KEY (ip, port)
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dns_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            client_ip TEXT NOT NULL,
            server_ip TEXT NOT NULL,
            qname TEXT NOT NULL,
            qtype TEXT NOT NULL,
            rcode INTEGER NOT NULL,
            answers INTEGER NOT NULL
        )",
        [],
    )?;
    // flow_records schema migration: rtt_ms + dns_qname
    for (col, decl) in [("rtt_ms", "INTEGER DEFAULT 0"), ("dns_qname", "TEXT")] {
        let has = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM pragma_table_info('flow_records') WHERE name = '{}'",
                    col
                ),
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
        if has == 0 {
            let _ = conn.execute(
                &format!("ALTER TABLE flow_records ADD COLUMN {} {}", col, decl),
                [],
            );
        }
    }
    Ok(())
}

pub fn upsert_geoip(entry: &crate::models::GeoIpEntry) {
    if let Ok(conn) = open_conn() {
        ensure_phase11_tables(&conn);
        let _ = conn.execute(
            "INSERT OR REPLACE INTO geoip_cache
             (ip, country, country_code, city, latitude, longitude, asn, org, source, resolved_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            rusqlite::params![
                entry.ip,
                entry.country,
                entry.country_code,
                entry.city,
                entry.latitude,
                entry.longitude,
                entry.asn,
                entry.org,
                entry.source,
                entry.resolved_at
            ],
        );
    }
}

pub fn load_geoip(ip: &str) -> Option<crate::models::GeoIpEntry> {
    let conn = open_conn().ok()?;
    ensure_phase11_tables(&conn);
    conn.query_row(
        "SELECT ip, country, country_code, city, latitude, longitude, asn, org, source, resolved_at
         FROM geoip_cache WHERE ip = ?1",
        [ip],
        |r| {
            Ok(crate::models::GeoIpEntry {
                ip: r.get(0)?,
                country: r.get(1)?,
                country_code: r.get(2)?,
                city: r.get(3)?,
                latitude: r.get(4)?,
                longitude: r.get(5)?,
                asn: r.get(6)?,
                org: r.get(7)?,
                source: r.get(8)?,
                resolved_at: r.get(9)?,
            })
        },
    )
    .ok()
}

pub fn upsert_threat_match(m: &crate::models::ThreatMatchEntry) {
    if let Ok(conn) = open_conn() {
        ensure_phase11_tables(&conn);
        let _ = conn.execute(
            "INSERT OR REPLACE INTO threat_matches
             (ip, indicator_type, feed, severity, feed_first_seen, feed_last_seen, matched_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![
                m.ip,
                m.indicator_type,
                m.feed,
                m.severity,
                m.feed_first_seen,
                m.feed_last_seen,
                m.matched_at
            ],
        );
    }
}

pub fn upsert_device(d: &crate::models::DeviceEntry) {
    if let Ok(conn) = open_conn() {
        ensure_phase11_tables(&conn);
        let active = if d.active { 1 } else { 0 };
        let is_self = if d.is_self { 1 } else { 0 };
        let _ = conn.execute(
            "INSERT OR REPLACE INTO devices
             (ip, mac, hostname, vendor, interface, first_seen, last_seen, active, is_self)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                d.ip,
                d.mac,
                d.hostname,
                d.vendor,
                d.interface,
                d.first_seen,
                d.last_seen,
                active,
                is_self
            ],
        );
    }
}

pub fn upsert_port_scan(p: &crate::models::PortScanEntry) {
    if let Ok(conn) = open_conn() {
        ensure_phase11_tables(&conn);
        let _ = conn.execute(
            "INSERT OR REPLACE INTO port_scan
             (ip, port, protocol, state, service, first_seen, last_seen)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![
                p.ip,
                p.port,
                p.protocol,
                p.state,
                p.service,
                p.first_seen,
                p.last_seen
            ],
        );
    }
}

pub fn insert_dns_record(r: &crate::models::DnsQueryEntry) {
    if let Ok(conn) = open_conn() {
        ensure_phase11_tables(&conn);
        let _ = conn.execute(
            "INSERT INTO dns_records (timestamp, client_ip, server_ip, qname, qtype, rcode, answers)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![
                r.timestamp,
                r.client_ip,
                r.server_ip,
                r.qname,
                r.qtype,
                r.rcode,
                r.answers
            ],
        );
        let _ = conn.execute(
            "DELETE FROM dns_records WHERE id NOT IN (SELECT id FROM dns_records ORDER BY id DESC LIMIT 2000)",
            [],
        );
    }
}

pub fn insert_dns_records_batch(records: &[crate::models::DnsQueryEntry]) {
    if records.is_empty() {
        return;
    }
    let Ok(conn) = open_conn() else {
        return;
    };
    ensure_phase11_tables(&conn);
    let mut stmt = match conn
        .prepare(
            "INSERT INTO dns_records (timestamp, client_ip, server_ip, qname, qtype, rcode, answers)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )
    {
        Ok(s) => s,
        Err(_) => return,
    };
    for r in records {
        let _ = stmt.execute(rusqlite::params![
            r.timestamp,
            r.client_ip,
            r.server_ip,
            r.qname,
            r.qtype,
            r.rcode,
            r.answers
        ]);
    }
    drop(stmt);
    let _ = conn.execute(
        "DELETE FROM dns_records WHERE id NOT IN (SELECT id FROM dns_records ORDER BY id DESC LIMIT 2000)",
        [],
    );
}

/// Appends a tamper-evident entry to the SHA-256 chained audit log.
/// Chain: curr_hash = sha256(prev_hash || actor || action || resource || timestamp).
/// Returns the new entry's current hash.
pub fn append_audit_entry(actor: &str, action: &str, resource: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let Ok(conn) = open_conn() else {
        return Err("audit: cannot open database".to_string());
    };
    let prev: String = conn
        .query_row(
            "SELECT curr_hash FROM audit_log ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "GENESIS".to_string());
    let timestamp = chrono::Utc::now().timestamp();
    let mut hasher = Sha256::new();
    hasher.update(prev.as_bytes());
    hasher.update(actor.as_bytes());
    hasher.update(action.as_bytes());
    hasher.update(resource.as_bytes());
    hasher.update(timestamp.to_string().as_bytes());
    let digest = hasher.finalize();
    let curr: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
    conn.execute(
        "INSERT INTO audit_log (timestamp, actor, action, resource, prev_hash, curr_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![timestamp, actor, action, resource, prev, curr],
    )
    .map_err(|e| e.to_string())?;
    Ok(curr)
}

/// Verifies the full audit chain from genesis; returns Ok(()) if every
/// curr_hash matches the recomputed hash of its predecessor.
pub fn verify_audit_chain() -> Result<bool, String> {
    use sha2::{Digest, Sha256};
    let Ok(conn) = open_conn() else {
        return Err("audit: cannot open database".to_string());
    };
    let mut stmt = conn
        .prepare("SELECT id, timestamp, actor, action, resource, prev_hash, curr_hash FROM audit_log ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut expected_prev = "GENESIS".to_string();
    for row in rows {
        let (_, ts, actor, action, resource, prev, curr) = row.map_err(|e| e.to_string())?;
        if prev != expected_prev {
            return Ok(false);
        }
        let mut hasher = Sha256::new();
        hasher.update(expected_prev.as_bytes());
        hasher.update(actor.as_bytes());
        hasher.update(action.as_bytes());
        hasher.update(resource.as_bytes());
        hasher.update(ts.to_string().as_bytes());
        let digest = hasher.finalize();
        let recomputed: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
        if recomputed != curr {
            return Ok(false);
        }
        expected_prev = curr;
    }
    Ok(true)
}

pub fn load_dns_records(limit: usize) -> Vec<crate::models::DnsQueryEntry> {
    let Ok(conn) = open_conn() else {
        return vec![];
    };
    ensure_phase11_tables(&conn);
    let mut stmt = match conn.prepare(
        "SELECT timestamp, client_ip, server_ip, qname, qtype, rcode, answers
         FROM dns_records ORDER BY id DESC LIMIT ?1",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map([limit as i64], |r| {
            Ok(crate::models::DnsQueryEntry {
                timestamp: r.get(0)?,
                client_ip: r.get(1)?,
                server_ip: r.get(2)?,
                qname: r.get(3)?,
                qtype: r.get(4)?,
                rcode: r.get(5)?,
                answers: r.get(6)?,
            })
        });
    let Ok(rows) = rows else { return vec![]; };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn load_devices(limit: usize) -> Vec<crate::models::DeviceEntry> {
    let Ok(conn) = open_conn() else {
        return vec![];
    };
    ensure_phase11_tables(&conn);
    let mut stmt = match conn.prepare(
        "SELECT ip, mac, hostname, vendor, interface, first_seen, last_seen, active, is_self
         FROM devices ORDER BY last_seen DESC LIMIT ?1",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map([limit as i64], |r| {
            Ok(crate::models::DeviceEntry {
                ip: r.get(0)?,
                mac: r.get(1)?,
                hostname: r.get(2)?,
                vendor: r.get(3)?,
                interface: r.get(4)?,
                first_seen: r.get(5)?,
                last_seen: r.get(6)?,
                active: r.get::<_, i64>(7)? != 0,
                is_self: r.get::<_, i64>(8)? != 0,
            })
        });
    let Ok(rows) = rows else { return vec![]; };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn load_port_scan(limit: usize) -> Vec<crate::models::PortScanEntry> {
    let Ok(conn) = open_conn() else {
        return vec![];
    };
    ensure_phase11_tables(&conn);
    let mut stmt = match conn.prepare(
        "SELECT ip, port, protocol, state, service, first_seen, last_seen
         FROM port_scan ORDER BY last_seen DESC LIMIT ?1",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map([limit as i64], |r| {
            Ok(crate::models::PortScanEntry {
                ip: r.get(0)?,
                port: r.get(1)?,
                protocol: r.get(2)?,
                state: r.get(3)?,
                service: r.get(4)?,
                first_seen: r.get(5)?,
                last_seen: r.get(6)?,
            })
        });
    let Ok(rows) = rows else { return vec![]; };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn load_threat_matches(limit: usize) -> Vec<crate::models::ThreatMatchEntry> {
    let Ok(conn) = open_conn() else {
        return vec![];
    };
    ensure_phase11_tables(&conn);
    let mut stmt = match conn.prepare(
        "SELECT ip, indicator_type, feed, severity, feed_first_seen, feed_last_seen, matched_at
         FROM threat_matches ORDER BY matched_at DESC LIMIT ?1",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map([limit as i64], |r| {
            Ok(crate::models::ThreatMatchEntry {
                ip: r.get(0)?,
                indicator_type: r.get(1)?,
                feed: r.get(2)?,
                severity: r.get(3)?,
                feed_first_seen: r.get(4)?,
                feed_last_seen: r.get(5)?,
                matched_at: r.get(6)?,
            })
        });
    let Ok(rows) = rows else { return vec![]; };
    rows.filter_map(|r| r.ok()).collect()
}
