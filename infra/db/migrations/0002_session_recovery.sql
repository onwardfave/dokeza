-- Session recovery columns for reconnect/resume support.
-- Tracks the last known sequence numbers and connection ID so that
-- a reconnecting client can resume an active session.

alter table meeting_sessions add column last_client_seq integer;
alter table meeting_sessions add column last_server_seq integer;
alter table meeting_sessions add column connection_id text;
