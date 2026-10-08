pub mod commands;
pub mod database;
pub mod models;
pub mod platform;
pub mod services;
pub mod state;

pub fn run() {
    services::init_logging();
    let storage = database::init_sqlite().map_err(|e| e.to_string());
    tauri::Builder::default()
        .manage(state::BackendState::new(storage))
        .manage(commands::capture_buddy::BuddyState::default())
        .manage(services::scan_buddy::ScanBuddyState::persistent())
        .manage(services::lab_runtime::LabRuntimeState::persistent())
        .invoke_handler(tauri::generate_handler![
            commands::scan_buddy::scan_buddy_plan,
            commands::scan_buddy::scan_buddy_start,
            commands::scan_buddy::scan_buddy_status,
            commands::scan_buddy::scan_buddy_cancel,
            commands::scan_buddy::scan_buddy_history,
            commands::scan_buddy::scan_buddy_storage_status,
            commands::scan_inspection::scan_buddy_inspect,
            commands::lab_runtime::lab_runtime_start,
            commands::lab_runtime::lab_runtime_stop,
            commands::lab_runtime::lab_runtime_status,
            commands::lab_runtime::lab_runtime_reset,
            commands::lab_runtime::lab_runtime_open,
            commands::lab_runtime::lab_runtime_action,
            commands::runtime_logs::get_recent_runtime_logs,
            commands::runtime_logs::get_runtime_log_status,
            commands::capture_buddy::buddy_engine_status,
            commands::capture_buddy::buddy_interfaces,
            commands::capture_buddy::buddy_open_file,
            commands::capture_buddy::buddy_packets,
            commands::capture_buddy::buddy_search_packets,
            commands::capture_buddy::buddy_packet_detail,
            commands::capture_buddy::buddy_session_status,
            commands::capture_buddy::buddy_start,
            commands::capture_buddy::buddy_stop,
            commands::capture_buddy::buddy_close,
            commands::capture_buddy::buddy_save_file,
            commands::capture_buddy::buddy_follow_tcp,
            commands::capture_buddy::buddy_statistics,
            commands::capture_buddy::buddy_investigation_brief,
            commands::capture_investigation::buddy_investigation_model,
            commands::readiness::get_backend_readiness,
            commands::backend::refresh_public_ip,
            commands::backend::refresh_geoip_lookup,
            commands::backend::check_connectivity,
            commands::backend::refresh_threat_intel,
            commands::backend::get_attack_graph,
            commands::backend::get_storylines,
            commands::backend::get_ja4_observations,
            commands::backend::get_ja4_stats,
            commands::backend::list_rules,
            commands::backend::enable_disable_rule,
            commands::backend::acknowledge_detection,
            commands::backend::resolve_detection,
            commands::backend::get_network_interfaces,
            commands::backend::get_detailed_network_interfaces,
            commands::backend::get_dns_records,
            commands::backend::execute_forensic_query,
            commands::backend::validate_forensic_query,
            commands::backend::get_forensic_schema,
            commands::backend::get_forensic_templates,
            commands::backend::get_saved_queries,
            commands::backend::save_forensic_query,
            commands::backend::get_detection_by_id,
            commands::backend::get_field_explanation,
            commands::backend::get_entity_explanation,
            commands::backend::get_detection_explanation,
            commands::backend::get_ja4_explanation,
            commands::backend::lookup_ja4,
            commands::backend::get_storyline_by_id,
            commands::backend::refresh_devices,
            commands::backend::get_port_scan_results,
            commands::backend::scan_host_ports,
            commands::backend::flush_flows_to_duckdb,
            commands::get_capability_status,
            commands::get_system_info,
            commands::get_detailed_system_info,
            commands::get_windows_events,
            commands::get_app_config,
            commands::get_host_identity,
            commands::get_system_snapshot,
            commands::get_tcp_sockets,
            commands::get_active_tcp_connections,
            commands::get_process_inventory,
            commands::get_socket_correlations,
            commands::audit_log,
            commands::get_audit_log,
            commands::ping_host,
            commands::check_port,
            commands::whois_rdap,
            commands::traceroute,
            commands::inspect_npcap_availability,
            commands::get_pcap_interfaces,
            commands::start_packet_capture,
            commands::stop_packet_capture,
            commands::get_capture_metrics,
            commands::get_capture_engine_state,
            commands::global_intel::get_global_intel_snapshot,
            commands::global_intel::get_active_flows,
            commands::global_intel::get_flow_summary,
            commands::global_intel::get_detections,
            commands::global_intel::get_detection_summary,
            commands::global_intel::get_connectivity_status,
            commands::global_intel::get_threat_intel_status,
            commands::global_intel::get_geoip_for_active_flows,
            commands::global_intel::get_geoip_lookup,
            commands::global_intel::get_public_ip,
            commands::global_intel::get_threat_matches,
            commands::global_intel::get_devices,
            commands::global_intel::evaluate_flows_for_threats,
            commands::auth::auth_register,
            commands::auth::auth_login,
            commands::auth::auth_logout,
            commands::auth::auth_session,
            commands::auth::auth_my_activity,
            commands::auth::admin_list_users,
            commands::auth::admin_list_activity,
        ])
        .build(tauri::generate_context!())
        .expect("Error building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                app.state::<commands::capture_buddy::BuddyState>().shutdown();
                app.state::<services::scan_buddy::ScanBuddyState>().shutdown();
                let _ = app.state::<services::lab_runtime::LabRuntimeState>().stop();
            }
        });
}
