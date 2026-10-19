use tauri::command;

#[command]
pub fn scan_buddy_discover_network_scope() -> crate::services::network_scope::NetworkScopeDiscovery
{
    crate::services::network_scope::discover()
}
