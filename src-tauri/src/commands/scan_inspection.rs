use crate::services::scan_inspection::{self, InspectionResponse};

#[tauri::command]
pub async fn scan_buddy_inspect(
    target: String,
    port: u16,
    authorized: bool,
    check: String,
) -> Result<InspectionResponse, String> {
    scan_inspection::inspect(target, port, authorized, check).await
}
