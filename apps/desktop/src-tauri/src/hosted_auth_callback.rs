use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize)]
pub struct HostedAuthCallbackRequest {
    pub port: u16,
    pub path: String,
    pub state: String,
    pub timeout_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct HostedAuthCallbackResponse {
    pub callback_url: String,
}

#[tauri::command]
pub async fn wait_for_hosted_auth_callback(
    request: HostedAuthCallbackRequest,
) -> Result<HostedAuthCallbackResponse, String> {
    tauri::async_runtime::spawn_blocking(move || wait_for_callback(request))
        .await
        .map_err(|_| "hosted_auth_callback_unavailable".to_string())?
}

fn wait_for_callback(
    request: HostedAuthCallbackRequest,
) -> Result<HostedAuthCallbackResponse, String> {
    validate_request(&request)?;
    let listener = TcpListener::bind(("127.0.0.1", request.port))
        .map_err(|_| "hosted_auth_callback_unavailable".to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "hosted_auth_callback_unavailable".to_string())?;

    let deadline = Instant::now() + Duration::from_millis(request.timeout_ms);
    loop {
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                return handle_stream(&request, &mut stream);
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("hosted_auth_callback_timeout".to_string());
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return Err("hosted_auth_callback_unavailable".to_string()),
        }
    }
}

fn handle_stream(
    request: &HostedAuthCallbackRequest,
    stream: &mut TcpStream,
) -> Result<HostedAuthCallbackResponse, String> {
    let mut buffer = [0_u8; 8192];
    let length = stream
        .read(&mut buffer)
        .map_err(|_| "hosted_auth_callback_unavailable".to_string())?;
    let raw_request = std::str::from_utf8(&buffer[..length])
        .map_err(|_| "hosted_auth_callback_rejected".to_string())?;
    let target = parse_request_target(raw_request)?;

    if !target.starts_with(&request.path) {
        write_browser_response(stream, 400, "Dokeza sign-in rejected.");
        return Err("hosted_auth_callback_rejected".to_string());
    }

    if query_param(target, "state").as_deref() != Some(request.state.as_str()) {
        write_browser_response(stream, 400, "Dokeza sign-in rejected.");
        return Err("hosted_auth_state_mismatch".to_string());
    }

    write_browser_response(
        stream,
        200,
        "Dokeza sign-in complete. You can return to the app.",
    );
    Ok(HostedAuthCallbackResponse {
        callback_url: format!("http://127.0.0.1:{}{}", request.port, target),
    })
}

fn validate_request(request: &HostedAuthCallbackRequest) -> Result<(), String> {
    if request.port == 0
        || request.path.trim().is_empty()
        || !request.path.starts_with('/')
        || request.state.trim().is_empty()
        || request.timeout_ms == 0
        || request.timeout_ms > 300_000
    {
        return Err("hosted_auth_callback_invalid_request".to_string());
    }

    Ok(())
}

fn parse_request_target(raw_request: &str) -> Result<&str, String> {
    let line = raw_request
        .lines()
        .next()
        .ok_or_else(|| "hosted_auth_callback_rejected".to_string())?;
    let mut parts = line.split_ascii_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| "hosted_auth_callback_rejected".to_string())?;
    let target = parts
        .next()
        .ok_or_else(|| "hosted_auth_callback_rejected".to_string())?;

    if method != "GET" || !target.starts_with('/') {
        return Err("hosted_auth_callback_rejected".to_string());
    }

    Ok(target)
}

fn query_param(target: &str, name: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            return Some(value.to_string());
        }
    }

    None
}

fn write_browser_response(stream: &mut TcpStream, status: u16, body: &str) {
    let status_text = if status == 200 { "OK" } else { "Bad Request" };
    let response = format!(
        "HTTP/1.1 {} {}\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        status,
        status_text,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_request_target() {
        let target =
            parse_request_target("GET /auth/callback?code=secret&state=abc HTTP/1.1\r\n\r\n")
                .expect("target");

        assert_eq!(target, "/auth/callback?code=secret&state=abc");
    }

    #[test]
    fn rejects_non_get_request_target() {
        assert_eq!(
            parse_request_target("POST /auth/callback?state=abc HTTP/1.1\r\n\r\n"),
            Err("hosted_auth_callback_rejected".to_string())
        );
    }

    #[test]
    fn extracts_exact_state_without_logging_query() {
        assert_eq!(
            query_param(
                "/auth/callback?code=provider_secret&state=state_123",
                "state"
            ),
            Some("state_123".to_string())
        );
    }

    #[test]
    fn validates_listener_request_shape() {
        assert_eq!(
            validate_request(&HostedAuthCallbackRequest {
                port: 0,
                path: "/auth/callback".to_string(),
                state: "state_123".to_string(),
                timeout_ms: 60_000,
            }),
            Err("hosted_auth_callback_invalid_request".to_string())
        );
    }
}
