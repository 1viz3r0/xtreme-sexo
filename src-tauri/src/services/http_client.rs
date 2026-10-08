use std::time::Duration;

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("NET0ZE/2.0 native-desktop")
        .https_only(true)
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build().map_err(|e| e.to_string())
}

/// Bound downloaded bodies as well as parsed records. Never retry a rate limit
/// automatically or turn an HTTP error page into a successful observation.
pub async fn read_text(client: &reqwest::Client, url: &str, max_bytes: usize) -> Result<String, String> {
    let mut response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Provider returned HTTP {}", response.status().as_u16()));
    }
    if response.content_length().is_some_and(|length| length > max_bytes as u64) {
        return Err("Provider response exceeds size limit".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if chunk.len() > max_bytes.saturating_sub(body.len()) {
            return Err("Provider response exceeds size limit".into());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "Provider response is not UTF-8".into())
}
