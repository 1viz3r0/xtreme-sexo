// NET0ZE auth commands — the only entry points the frontend can call.
// Every request is validated back-end side: session token, role, input shape.
// A compromised frontend cannot forge a session or escalate roles.

use crate::services::auth_service::{self, ActivityEntry, AuthSession, PublicUser};
use tauri::command;

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|_| "Authentication worker failed".to_string())?
}

#[command]
pub async fn auth_register(
    name: String,
    email: String,
    password: String,
) -> Result<AuthSession, String> {
    blocking(move || auth_service::register(&name, &email, &password)).await
}

#[command]
pub async fn auth_login(email: String, password: String) -> Result<AuthSession, String> {
    blocking(move || auth_service::login(&email, &password)).await
}

#[command]
pub async fn auth_logout(token: String) -> Result<(), String> {
    blocking(move || auth_service::logout(&token)).await
}

#[command]
pub async fn auth_session(token: String) -> Result<Option<PublicUser>, String> {
    blocking(move || auth_service::session_user(&token)).await
}

#[command]
pub async fn auth_my_activity(token: String, limit: Option<usize>) -> Result<Vec<ActivityEntry>, String> {
    blocking(move || auth_service::my_activity(&token, limit.unwrap_or(50))).await
}

#[command]
pub async fn admin_list_users(token: String) -> Result<Vec<PublicUser>, String> {
    blocking(move || auth_service::admin_list_users(&token)).await
}

#[command]
pub async fn admin_list_activity(
    token: String,
    limit: Option<usize>,
) -> Result<Vec<ActivityEntry>, String> {
    blocking(move || auth_service::admin_list_activity(&token, limit.unwrap_or(100))).await
}
