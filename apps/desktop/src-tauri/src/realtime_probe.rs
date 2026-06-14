use std::{
    net::{SocketAddr, TcpListener},
    thread,
    time::Instant,
};

use serde::Serialize;
use serde_json::{json, Value};
use tungstenite::{accept, connect, Message};

const BACKEND: &str = "local_realtime_websocket";
const PROTOCOL_VERSION: &str = "2026-06-12";
const SESSION_ID: &str = "sess_synthetic_realtime_probe";
const WORKSPACE_ID: &str = "ws_synthetic_realtime_probe";
const SENT_AT: &str = "2026-06-14T00:00:00.000Z";
const SYNTHETIC_AUDIO_BYTES: [u8; 4] = [0, 0, 0, 0];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RealtimeWebSocketProbeReport {
    pub backend: String,
    pub protocol_version: String,
    pub transport: String,
    pub endpoint: String,
    pub outbound_json_messages: u64,
    pub outbound_binary_frames: u64,
    pub inbound_json_messages: u64,
    pub server_observed_json_messages: u64,
    pub server_observed_binary_frames: u64,
    pub audio_chunk_bytes_sent: u64,
    pub audio_gap_sent: bool,
    pub last_client_seq: u64,
    pub sensitive_markers_found: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProbeServerObservation {
    observed_json_messages: u64,
    observed_binary_frames: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ProbeOutboundFrame {
    Json(Value),
    Binary(Vec<u8>),
}

#[tauri::command]
pub fn probe_realtime_websocket() -> Result<RealtimeWebSocketProbeReport, String> {
    probe_realtime_websocket_with_loopback_server()
}

fn probe_realtime_websocket_with_loopback_server() -> Result<RealtimeWebSocketProbeReport, String> {
    let started_at = Instant::now();
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    let server_addr = listener.local_addr().map_err(|error| error.to_string())?;
    let server_handle = thread::Builder::new()
        .name("realtime-websocket-probe-server".to_string())
        .spawn(move || run_probe_server(listener))
        .map_err(|error| error.to_string())?;

    let client_observation = run_probe_client(server_addr)?;
    let server_observation = server_handle
        .join()
        .map_err(|_| "realtime_websocket_probe_server_thread_panicked".to_string())??;

    Ok(RealtimeWebSocketProbeReport {
        backend: BACKEND.to_string(),
        protocol_version: PROTOCOL_VERSION.to_string(),
        transport: "websocket".to_string(),
        endpoint: "loopback".to_string(),
        outbound_json_messages: client_observation.outbound_json_messages,
        outbound_binary_frames: client_observation.outbound_binary_frames,
        inbound_json_messages: client_observation.inbound_json_messages,
        server_observed_json_messages: server_observation.observed_json_messages,
        server_observed_binary_frames: server_observation.observed_binary_frames,
        audio_chunk_bytes_sent: client_observation.audio_chunk_bytes_sent,
        audio_gap_sent: client_observation.audio_gap_sent,
        last_client_seq: client_observation.last_client_seq,
        sensitive_markers_found: count_synthetic_sensitive_markers(&client_observation.sent_json),
        duration_ms: started_at
            .elapsed()
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProbeClientObservation {
    outbound_json_messages: u64,
    outbound_binary_frames: u64,
    inbound_json_messages: u64,
    audio_chunk_bytes_sent: u64,
    audio_gap_sent: bool,
    last_client_seq: u64,
    sent_json: Vec<String>,
}

fn run_probe_client(server_addr: SocketAddr) -> Result<ProbeClientObservation, String> {
    let url = format!("ws://{server_addr}");
    let (mut socket, _response) = connect(url.as_str()).map_err(|error| error.to_string())?;
    let frames = build_probe_frames();
    let mut observation = ProbeClientObservation {
        outbound_json_messages: 0,
        outbound_binary_frames: 0,
        inbound_json_messages: 0,
        audio_chunk_bytes_sent: 0,
        audio_gap_sent: false,
        last_client_seq: 0,
        sent_json: Vec::new(),
    };

    for frame in frames {
        match frame {
            ProbeOutboundFrame::Json(value) => {
                let message_type = message_type(&value)?;
                let seq = value
                    .get("seq")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| "realtime_probe_missing_sequence".to_string())?;
                let serialized =
                    serde_json::to_string(&value).map_err(|error| error.to_string())?;

                socket
                    .send(Message::Text(serialized.clone().into()))
                    .map_err(|error| error.to_string())?;
                observation.outbound_json_messages += 1;
                observation.last_client_seq = seq;
                observation.audio_gap_sent |= message_type == "audio.gap";
                observation.sent_json.push(serialized);

                if message_type == "auth.hello" || message_type == "session.end" {
                    let response = socket.read().map_err(|error| error.to_string())?;
                    if !matches!(response, Message::Text(_)) {
                        return Err("realtime_probe_expected_json_response".to_string());
                    }
                    observation.inbound_json_messages += 1;
                }
            }
            ProbeOutboundFrame::Binary(bytes) => {
                observation.outbound_binary_frames += 1;
                observation.audio_chunk_bytes_sent += bytes.len() as u64;
                socket
                    .send(Message::Binary(bytes.into()))
                    .map_err(|error| error.to_string())?;
            }
        }
    }

    let _ = socket.close(None);

    Ok(observation)
}

fn run_probe_server(listener: TcpListener) -> Result<ProbeServerObservation, String> {
    let (stream, _addr) = listener.accept().map_err(|error| error.to_string())?;
    let mut socket = accept(stream).map_err(|error| error.to_string())?;
    let mut observed_json_messages = 0_u64;
    let mut observed_binary_frames = 0_u64;
    let mut expected_binary_byte_length: Option<usize> = None;

    loop {
        let message = socket.read().map_err(|error| error.to_string())?;

        match message {
            Message::Text(text) => {
                if expected_binary_byte_length.is_some() {
                    return Err("realtime_probe_missing_binary_payload".to_string());
                }

                observed_json_messages += 1;
                let value: Value =
                    serde_json::from_str(text.as_ref()).map_err(|error| error.to_string())?;
                let message_type = message_type(&value)?;

                match message_type {
                    "auth.hello" => {
                        socket
                            .send(Message::Text(
                                json_response("auth.accepted", 0, auth_accepted_payload())
                                    .to_string()
                                    .into(),
                            ))
                            .map_err(|error| error.to_string())?;
                    }
                    "audio.chunk_meta" => {
                        expected_binary_byte_length = Some(audio_byte_length(&value)?);
                    }
                    "session.end" => {
                        socket
                            .send(Message::Text(
                                json_response("session.closed", 1, session_closed_payload())
                                    .to_string()
                                    .into(),
                            ))
                            .map_err(|error| error.to_string())?;
                        break;
                    }
                    _ => {}
                }
            }
            Message::Binary(bytes) => {
                let expected = expected_binary_byte_length
                    .take()
                    .ok_or_else(|| "realtime_probe_unexpected_binary_payload".to_string())?;

                if bytes.len() != expected {
                    return Err("realtime_probe_audio_byte_length_mismatch".to_string());
                }

                observed_binary_frames += 1;
            }
            Message::Close(_) => break,
            Message::Ping(bytes) => {
                socket
                    .send(Message::Pong(bytes))
                    .map_err(|error| error.to_string())?;
            }
            Message::Pong(_) | Message::Frame(_) => {}
        }
    }

    Ok(ProbeServerObservation {
        observed_json_messages,
        observed_binary_frames,
    })
}

fn build_probe_frames() -> Vec<ProbeOutboundFrame> {
    vec![
        ProbeOutboundFrame::Json(json!({
            "protocol_version": PROTOCOL_VERSION,
            "type": "auth.hello",
            "seq": 0,
            "sent_at": SENT_AT,
            "payload": {
                "token": "synthetic-local-probe-token",
                "client_version": env!("CARGO_PKG_VERSION"),
                "platform": platform_name(),
                "device_id": "dev_synthetic_realtime_probe"
            }
        })),
        ProbeOutboundFrame::Json(json!({
            "protocol_version": PROTOCOL_VERSION,
            "type": "session.start",
            "seq": 1,
            "session_id": SESSION_ID,
            "sent_at": SENT_AT,
            "payload": {
                "workspace_id": WORKSPACE_ID,
                "meeting_source": "local_probe",
                "capture": {
                    "microphone": true,
                    "system_audio": false,
                    "screen_context": false
                },
                "processing": {
                    "stt": "cloud",
                    "llm": "cloud",
                    "retrieval": "cloud"
                }
            }
        })),
        ProbeOutboundFrame::Json(json!({
            "protocol_version": PROTOCOL_VERSION,
            "type": "audio.chunk_meta",
            "seq": 2,
            "session_id": SESSION_ID,
            "sent_at": SENT_AT,
            "payload": {
                "chunk_id": "aud_synthetic_realtime_probe_0",
                "chunk_index": 0,
                "stream": "microphone",
                "format": "pcm_s16le",
                "sample_rate_hz": 16000,
                "channels": 1,
                "duration_ms": 100,
                "timestamp_ms": 0,
                "byte_length": SYNTHETIC_AUDIO_BYTES.len()
            }
        })),
        ProbeOutboundFrame::Binary(SYNTHETIC_AUDIO_BYTES.to_vec()),
        ProbeOutboundFrame::Json(json!({
            "protocol_version": PROTOCOL_VERSION,
            "type": "audio.gap",
            "seq": 3,
            "session_id": SESSION_ID,
            "sent_at": SENT_AT,
            "payload": {
                "stream": "microphone",
                "start_ms": 100,
                "end_ms": 200,
                "dropped_chunks": 1,
                "reason": "user_paused_capture"
            }
        })),
        ProbeOutboundFrame::Json(json!({
            "protocol_version": PROTOCOL_VERSION,
            "type": "session.end",
            "seq": 4,
            "session_id": SESSION_ID,
            "sent_at": SENT_AT,
            "payload": {
                "reason": "user_stopped",
                "last_client_seq": 4
            }
        })),
    ]
}

fn json_response(message_type: &str, seq: u64, payload: Value) -> Value {
    json!({
        "protocol_version": PROTOCOL_VERSION,
        "type": message_type,
        "seq": seq,
        "session_id": SESSION_ID,
        "sent_at": SENT_AT,
        "payload": payload,
    })
}

fn auth_accepted_payload() -> Value {
    json!({
        "connection_id": "conn_synthetic_realtime_probe",
        "workspace_id": WORKSPACE_ID,
        "policy": {
            "screen_context_allowed": true,
            "cloud_stt_allowed": true,
            "direct_provider_stt_allowed": false,
            "retention_mode": "live_only",
            "max_local_audio_buffer_ms": 300000
        }
    })
}

fn session_closed_payload() -> Value {
    json!({
        "reason": "user_stopped",
        "final_server_seq": 1
    })
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else {
        "windows"
    }
}

fn message_type(value: &Value) -> Result<&str, String> {
    value
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "realtime_probe_missing_message_type".to_string())
}

fn audio_byte_length(value: &Value) -> Result<usize, String> {
    value
        .get("payload")
        .and_then(|payload| payload.get("byte_length"))
        .and_then(Value::as_u64)
        .ok_or_else(|| "realtime_probe_missing_audio_byte_length".to_string())?
        .try_into()
        .map_err(|_| "realtime_probe_audio_byte_length_overflow".to_string())
}

fn count_synthetic_sensitive_markers(serialized_messages: &[String]) -> u64 {
    let joined_messages = serialized_messages.join("\n");
    synthetic_sensitive_markers()
        .iter()
        .filter(|marker| joined_messages.contains(*marker))
        .count()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn synthetic_sensitive_markers() -> [&'static str; 5] {
    [
        "customer-secret-transcript",
        "raw-prompt-body",
        "internal-document-content",
        "generated-suggestion-content",
        "real-audio-bytes",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_frame_plan_uses_expected_message_order_and_sequences() {
        let json_frames: Vec<Value> = build_probe_frames()
            .into_iter()
            .filter_map(|frame| match frame {
                ProbeOutboundFrame::Json(value) => Some(value),
                ProbeOutboundFrame::Binary(_) => None,
            })
            .collect();

        let message_types: Vec<&str> = json_frames
            .iter()
            .map(message_type)
            .collect::<Result<Vec<_>, _>>()
            .expect("message types should be present");
        let sequences: Vec<u64> = json_frames
            .iter()
            .map(|value| {
                value
                    .get("seq")
                    .and_then(Value::as_u64)
                    .expect("sequence should be present")
            })
            .collect();

        assert_eq!(
            message_types,
            vec![
                "auth.hello",
                "session.start",
                "audio.chunk_meta",
                "audio.gap",
                "session.end",
            ]
        );
        assert_eq!(sequences, vec![0, 1, 2, 3, 4]);
    }

    #[test]
    fn audio_chunk_metadata_matches_synthetic_binary_frame_length() {
        let frames = build_probe_frames();
        let audio_meta = frames
            .iter()
            .find_map(|frame| match frame {
                ProbeOutboundFrame::Json(value)
                    if message_type(value).ok() == Some("audio.chunk_meta") =>
                {
                    Some(value)
                }
                _ => None,
            })
            .expect("audio metadata should exist");
        let audio_bytes = frames
            .iter()
            .find_map(|frame| match frame {
                ProbeOutboundFrame::Binary(bytes) => Some(bytes),
                _ => None,
            })
            .expect("audio bytes should exist");

        assert_eq!(
            audio_byte_length(audio_meta).expect("audio byte length should be valid"),
            audio_bytes.len()
        );
    }

    #[test]
    fn outbound_messages_do_not_include_synthetic_sensitive_markers() {
        let serialized_messages = build_probe_frames()
            .into_iter()
            .filter_map(|frame| match frame {
                ProbeOutboundFrame::Json(value) => Some(value.to_string()),
                ProbeOutboundFrame::Binary(_) => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(count_synthetic_sensitive_markers(&serialized_messages), 0);
    }

    #[test]
    fn loopback_websocket_probe_reports_metadata_only_counts() {
        let report = probe_realtime_websocket_with_loopback_server()
            .expect("loopback websocket probe should pass");

        assert_eq!(report.backend, BACKEND);
        assert_eq!(report.protocol_version, PROTOCOL_VERSION);
        assert_eq!(report.transport, "websocket");
        assert_eq!(report.endpoint, "loopback");
        assert_eq!(report.outbound_json_messages, 5);
        assert_eq!(report.outbound_binary_frames, 1);
        assert_eq!(report.inbound_json_messages, 2);
        assert_eq!(report.server_observed_json_messages, 5);
        assert_eq!(report.server_observed_binary_frames, 1);
        assert_eq!(
            report.audio_chunk_bytes_sent,
            SYNTHETIC_AUDIO_BYTES.len() as u64
        );
        assert!(report.audio_gap_sent);
        assert_eq!(report.last_client_seq, 4);
        assert_eq!(report.sensitive_markers_found, 0);
    }
}
