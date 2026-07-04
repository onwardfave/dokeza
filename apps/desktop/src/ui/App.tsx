import {
  REALTIME_PROTOCOL_VERSION,
  type MeetingDetailResponse,
  type MeetingExportResponse,
  type MeetingSummary,
} from "@dokeza/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DesktopRealtimeSessionClient,
  type DesktopRealtimeSnapshot,
} from "../protocol/desktopRealtimeSession.js";
import {
  ContinuousMicrophoneCaptureController,
  type ContinuousMicrophoneCaptureControllerOptions,
  type MicrophoneCaptureSnapshot,
} from "../protocol/microphoneCaptureController.js";
import {
  requestDevelopmentApiToken,
  requestRealtimeSessionToken,
} from "../protocol/authApiClient.js";
import {
  deleteMeeting,
  exportMeeting,
  getMeetingDetail,
  listMeetings,
} from "../protocol/meetingReviewApiClient.js";
import {
  captureMicrophonePcmChunks,
  listMicrophoneCaptureDevices,
  type NativeMicrophoneCaptureDevice,
} from "../protocol/nativeMicrophoneSource.js";
import {
  formatDiagnosticDetails,
  isTauriRuntime,
  runDesktopDiagnostic,
  type DiagnosticAction,
  type DiagnosticOutcome,
} from "./desktopDiagnostics.js";
import {
  getLiveSessionDetail,
  getLiveSessionStatusView,
  toLiveSuggestionCards,
  toLiveTranscriptRows,
} from "./liveSessionViewModel.js";
import { selectDesktopSurface } from "./surfaces.js";

const initialLiveSessionSnapshot: DesktopRealtimeSnapshot = {
  status: "idle",
  lastClientSeq: 0,
  lastServerSeq: 0,
  transcripts: [],
  suggestions: [],
};

const initialMicrophoneCaptureSnapshot: MicrophoneCaptureSnapshot = {
  state: "idle",
  chunksSent: 0,
  nextChunkIndex: 0,
  streamTimeMs: 0,
};

const liveSessionBroadcastChannel = "dokeza.live-session";

interface LiveSessionBroadcastMessage {
  type: "live-session.snapshot";
  snapshot: DesktopRealtimeSnapshot;
}

export function App() {
  const surface = selectDesktopSurface(globalThis.location.hash);

  if (surface === "overlay") {
    return <OverlaySurface />;
  }

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Desktop Spike</p>
        <h1>Dokeza</h1>
        <dl>
          <div>
            <dt>Protocol</dt>
            <dd>{REALTIME_PROTOCOL_VERSION}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>WebSocket over TLS</dd>
          </div>
          <div>
            <dt>STT route</dt>
            <dd>Backend adapter</dd>
          </div>
        </dl>
        <LiveSessionPanel />
        <MeetingReviewPanel />
        <DiagnosticsPanel />
      </section>
    </main>
  );
}

function LiveSessionPanel() {
  const [endpoint, setEndpoint] = useState("ws://127.0.0.1:3001/realtime");
  const [apiEndpoint, setApiEndpoint] = useState("http://127.0.0.1:3000");
  const [workspaceId, setWorkspaceId] = useState("ws_dev");
  const [token, setToken] = useState("");
  const [authMessage, setAuthMessage] = useState("No realtime token");
  const [snapshot, setSnapshot] = useState<DesktopRealtimeSnapshot>(initialLiveSessionSnapshot);
  const [microphoneDevices, setMicrophoneDevices] = useState<NativeMicrophoneCaptureDevice[]>([]);
  const [selectedMicrophoneDeviceId, setSelectedMicrophoneDeviceId] = useState("");
  const [captureSnapshot, setCaptureSnapshot] = useState<MicrophoneCaptureSnapshot>(
    initialMicrophoneCaptureSnapshot,
  );
  const [suggestionKind, setSuggestionKind] = useState<
    "answer_question" | "summarize_so_far" | "suggest_follow_up" | "objection_response"
  >("answer_question");
  const [suggestionPrompt, setSuggestionPrompt] = useState("Suggest an answer");
  const clientRef = useRef<DesktopRealtimeSessionClient | null>(null);
  const captureControllerRef = useRef<ContinuousMicrophoneCaptureController | null>(null);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const nativeRuntimeAvailable = useMemo(() => isTauriRuntime(), []);
  const status = getLiveSessionStatusView(snapshot.status);
  const detail = getLiveSessionDetail(snapshot);
  const transcriptRows = toLiveTranscriptRows(snapshot.transcripts);
  const suggestionCards = toLiveSuggestionCards(snapshot.suggestions);
  const canStart =
    snapshot.status === "idle" || snapshot.status === "closed" || snapshot.status === "failed";
  const canStartWithToken = canStart && token.trim().length > 0;
  const canStop =
    snapshot.status === "connecting" ||
    snapshot.status === "connected" ||
    snapshot.status === "streaming" ||
    snapshot.status === "degraded";
  const canPauseCapture = captureSnapshot.state === "capturing";
  const canResumeCapture = captureSnapshot.state === "paused";
  const canRequestSuggestion = snapshot.status === "streaming" || snapshot.status === "degraded";
  const selectedMicrophoneDevice =
    microphoneDevices.find((device) => device.id === selectedMicrophoneDeviceId) ?? null;
  const captureLabel = getMicrophoneCaptureLabel(captureSnapshot);

  useEffect(() => {
    broadcastRef.current = openLiveSessionBroadcastChannel();
    if (nativeRuntimeAvailable) {
      void refreshMicrophoneDevices();
    }

    return () => {
      window.clearInterval(refreshTimerRef.current);
      captureControllerRef.current?.stop();
      broadcastRef.current?.close();
    };
  }, [nativeRuntimeAvailable]);

  useEffect(() => {
    broadcastRef.current?.postMessage({
      type: "live-session.snapshot",
      snapshot,
    } satisfies LiveSessionBroadcastMessage);
  }, [snapshot]);

  function refreshSnapshot() {
    const client = clientRef.current;
    if (client !== null) {
      setSnapshot(client.snapshot);
    }
  }

  function startRefreshLoop() {
    window.clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = window.setInterval(refreshSnapshot, 250);
  }

  async function refreshMicrophoneDevices() {
    try {
      const devices = await listMicrophoneCaptureDevices();
      setMicrophoneDevices(devices);
      setSelectedMicrophoneDeviceId((current) => {
        if (current !== "" && devices.some((device) => device.id === current)) {
          return current;
        }

        return devices.find((device) => device.is_default)?.id ?? devices[0]?.id ?? "";
      });
    } catch {
      setMicrophoneDevices([]);
      setSelectedMicrophoneDeviceId("");
      setCaptureSnapshot({
        ...initialMicrophoneCaptureSnapshot,
        state: "failed",
        lastErrorCode: "microphone_device_list_failed",
      });
    }
  }

  function startSession() {
    captureControllerRef.current?.stop();
    captureControllerRef.current = null;
    setCaptureSnapshot(initialMicrophoneCaptureSnapshot);

    const client = new DesktopRealtimeSessionClient({
      endpoint,
      token,
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_desktop_preview",
      syntheticAudio: {
        chunkCount: 3,
        samplesPerChunk: 1600,
      },
    });
    clientRef.current = client;
    client.startSyntheticSession();
    setSnapshot(client.snapshot);
    startRefreshLoop();
  }

  async function startMicrophoneSession() {
    captureControllerRef.current?.stop();

    const client = new DesktopRealtimeSessionClient({
      endpoint,
      token,
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_desktop_preview",
      syntheticAudio: {
        chunkCount: 0,
      },
    });
    clientRef.current = client;
    client.startSyntheticSession();
    setSnapshot(client.snapshot);
    startRefreshLoop();

    const controllerOptions: ContinuousMicrophoneCaptureControllerOptions = {
      capture: ({ deviceId }) =>
        captureMicrophonePcmChunks(deviceId === undefined ? {} : { deviceId }),
      sendAudioChunk: (chunk) => client.sendAudioChunk(chunk),
      sendAudioGap: (gap) => client.sendAudioGap(gap),
      onStateChange: setCaptureSnapshot,
    };
    if (selectedMicrophoneDeviceId !== "") {
      controllerOptions.deviceId = selectedMicrophoneDeviceId;
    }

    const controller = new ContinuousMicrophoneCaptureController(controllerOptions);
    captureControllerRef.current = controller;
    controller.start();
    setCaptureSnapshot(controller.snapshot);
  }

  function pauseMicrophoneCapture() {
    captureControllerRef.current?.pause();
    if (captureControllerRef.current !== null) {
      setCaptureSnapshot(captureControllerRef.current.snapshot);
    }
    refreshSnapshot();
  }

  function resumeMicrophoneCapture() {
    captureControllerRef.current?.resume();
    if (captureControllerRef.current !== null) {
      setCaptureSnapshot(captureControllerRef.current.snapshot);
    }
    refreshSnapshot();
  }

  function stopSession() {
    captureControllerRef.current?.stop();
    if (captureControllerRef.current !== null) {
      setCaptureSnapshot(captureControllerRef.current.snapshot);
    }
    clientRef.current?.stop("user_stopped");
    refreshSnapshot();
  }

  function requestLiveSuggestion() {
    clientRef.current?.requestLiveSuggestion({
      kind: suggestionKind,
      userPrompt: suggestionPrompt,
      includeSources: false,
    });
    refreshSnapshot();
  }

  async function requestDevRealtimeToken() {
    setAuthMessage("Requesting token");

    try {
      const apiToken = await requestDevelopmentApiToken({
        apiBaseUrl: apiEndpoint,
        workspaceId,
        userId: "user_desktop_preview",
      });
      const realtimeToken = await requestRealtimeSessionToken({
        apiBaseUrl: apiEndpoint,
        apiToken: apiToken.token,
        workspaceId,
        deviceId: "dev_desktop_preview",
      });
      setToken(realtimeToken.token);
      setAuthMessage(`Token ready for ${realtimeToken.workspaceId}`);
    } catch {
      setToken("");
      setAuthMessage("Auth token request failed");
    }
  }

  return (
    <section className="live-session" aria-labelledby="live-session-title">
      <div className="live-session-header">
        <div>
          <p className="eyebrow">Live Session</p>
          <h2 id="live-session-title">Realtime session</h2>
        </div>
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
      </div>
      <div className="live-session-controls">
        <label>
          <span>Endpoint</span>
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label>
          <span>API endpoint</span>
          <input
            value={apiEndpoint}
            onChange={(event) => setApiEndpoint(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label>
          <span>Workspace</span>
          <input
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label>
          <span>Dev token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label>
          <span>Microphone</span>
          <select
            value={selectedMicrophoneDeviceId}
            onChange={(event) => setSelectedMicrophoneDeviceId(event.currentTarget.value)}
            disabled={!canStart || !nativeRuntimeAvailable || microphoneDevices.length === 0}
          >
            {microphoneDevices.length === 0 ? (
              <option value="">Default microphone</option>
            ) : (
              microphoneDevices.map((device) => (
                <option value={device.id} key={device.id}>
                  {device.name ?? `Microphone ${device.id}`}
                  {device.is_default ? " (default)" : ""}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="live-session-buttons">
          <button type="button" disabled={!canStart} onClick={() => void requestDevRealtimeToken()}>
            Get dev token
          </button>
          <button
            type="button"
            disabled={!canStart || !nativeRuntimeAvailable}
            onClick={() => void refreshMicrophoneDevices()}
          >
            Refresh mics
          </button>
          <button type="button" disabled={!canStartWithToken} onClick={startSession}>
            Start synthetic
          </button>
          <button
            type="button"
            disabled={!canStartWithToken || !nativeRuntimeAvailable}
            onClick={() => void startMicrophoneSession()}
          >
            Start microphone
          </button>
          <button type="button" disabled={!canStop} onClick={stopSession}>
            Stop
          </button>
          <button type="button" disabled={!canPauseCapture} onClick={pauseMicrophoneCapture}>
            Pause mic
          </button>
          <button type="button" disabled={!canResumeCapture} onClick={resumeMicrophoneCapture}>
            Resume mic
          </button>
        </div>
        <label>
          <span>Suggestion</span>
          <select
            value={suggestionKind}
            onChange={(event) =>
              setSuggestionKind(
                event.currentTarget.value as
                  | "answer_question"
                  | "summarize_so_far"
                  | "suggest_follow_up"
                  | "objection_response",
              )
            }
            disabled={!canRequestSuggestion}
          >
            <option value="answer_question">Answer question</option>
            <option value="summarize_so_far">Summarize so far</option>
            <option value="suggest_follow_up">Follow-up question</option>
            <option value="objection_response">Objection response</option>
          </select>
        </label>
        <label>
          <span>Prompt</span>
          <input
            value={suggestionPrompt}
            onChange={(event) => setSuggestionPrompt(event.currentTarget.value)}
            disabled={!canRequestSuggestion}
          />
        </label>
        <div className="live-session-buttons">
          <button type="button" disabled={!canRequestSuggestion} onClick={requestLiveSuggestion}>
            Suggest
          </button>
        </div>
      </div>
      <p className="live-session-detail">{authMessage}</p>
      <p className="live-session-detail">{detail}</p>
      <dl className="live-session-stats">
        <div>
          <dt>Capture</dt>
          <dd>{captureLabel}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>
            {selectedMicrophoneDevice?.name ??
              (selectedMicrophoneDeviceId === ""
                ? "Default microphone"
                : selectedMicrophoneDeviceId)}
          </dd>
        </div>
        <div>
          <dt>Client seq</dt>
          <dd>{snapshot.lastClientSeq}</dd>
        </div>
        <div>
          <dt>Server seq</dt>
          <dd>{snapshot.lastServerSeq}</dd>
        </div>
      </dl>
      <div className="live-transcript" aria-live="polite">
        {transcriptRows.length === 0 ? (
          <p className="live-transcript-empty">Transcript waiting</p>
        ) : (
          transcriptRows.map((row) => (
            <article className={`transcript-row ${row.state}`} key={row.id}>
              <div>
                <span>{row.speaker}</span>
                <strong>{row.state}</strong>
              </div>
              <p>{row.text}</p>
            </article>
          ))
        )}
      </div>
      <div className="live-suggestions" aria-live="polite">
        {suggestionCards.length === 0 ? (
          <p className="live-transcript-empty">Suggestions waiting</p>
        ) : (
          suggestionCards.map((suggestion) => (
            <article className={`suggestion-card ${suggestion.state}`} key={suggestion.id}>
              <div>
                <span>{suggestion.kind}</span>
                <strong>{suggestion.meta}</strong>
              </div>
              <p>{suggestion.content}</p>
              {suggestion.sources.length > 0 ? (
                <ul className="suggestion-sources">
                  {suggestion.sources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MeetingReviewPanel() {
  const [apiEndpoint, setApiEndpoint] = useState("http://127.0.0.1:3000");
  const [workspaceId, setWorkspaceId] = useState("ws_dev");
  const [apiToken, setApiToken] = useState("");
  const [message, setMessage] = useState("No meeting history loaded");
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [detail, setDetail] = useState<MeetingDetailResponse | null>(null);
  const [exportFormat, setExportFormat] = useState<MeetingExportResponse["format"]>("markdown");
  const [exportContent, setExportContent] = useState("");
  const canCallApi = apiToken.trim().length > 0 && workspaceId.trim().length > 0;
  const selectedMeeting =
    meetings.find((meeting) => meeting.meeting_id === selectedMeetingId) ?? null;

  async function requestReviewToken() {
    setMessage("Requesting API token");

    try {
      const token = await requestDevelopmentApiToken({
        apiBaseUrl: apiEndpoint,
        workspaceId,
        userId: "user_desktop_preview",
      });
      setApiToken(token.token);
      setMessage(`API token ready for ${token.userId}`);
    } catch {
      setApiToken("");
      setMessage("API token request failed");
    }
  }

  async function refreshMeetings() {
    if (!canCallApi) {
      setMessage("API token required");
      return;
    }

    try {
      const nextMeetings = await listMeetings({
        apiBaseUrl: apiEndpoint,
        apiToken,
        workspaceId,
        transcriptQuery,
      });
      setMeetings(nextMeetings);
      const nextSelectedId = nextMeetings[0]?.meeting_id ?? "";
      setSelectedMeetingId(nextSelectedId);
      setDetail(null);
      setExportContent("");
      setMessage(`${nextMeetings.length} meetings loaded`);
      if (nextSelectedId !== "") {
        await loadMeeting(nextSelectedId);
      }
    } catch {
      setMessage("Meeting history unavailable");
    }
  }

  async function loadMeeting(meetingId: string) {
    if (!canCallApi) {
      setMessage("API token required");
      return;
    }

    setSelectedMeetingId(meetingId);
    setExportContent("");

    try {
      const nextDetail = await getMeetingDetail({
        apiBaseUrl: apiEndpoint,
        apiToken,
        workspaceId,
        meetingId,
      });
      setDetail(nextDetail);
      setMessage(`Meeting ${meetingId} loaded`);
    } catch {
      setDetail(null);
      setMessage("Meeting detail unavailable");
    }
  }

  async function runExport() {
    if (!canCallApi || selectedMeetingId === "") {
      setMessage("Select a meeting first");
      return;
    }

    try {
      const exported = await exportMeeting({
        apiBaseUrl: apiEndpoint,
        apiToken,
        workspaceId,
        meetingId: selectedMeetingId,
        format: exportFormat,
      });
      setExportContent(exported.content);
      setMessage(`${exported.format} export ready`);
    } catch {
      setExportContent("");
      setMessage("Meeting export failed");
    }
  }

  async function copyExport() {
    if (exportContent.length === 0 || navigator.clipboard === undefined) {
      setMessage("Export content unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(exportContent);
      setMessage("Export copied");
    } catch {
      setMessage("Clipboard copy failed");
    }
  }

  async function deleteSelectedMeeting() {
    if (!canCallApi || selectedMeetingId === "") {
      setMessage("Select a meeting first");
      return;
    }

    try {
      await deleteMeeting({
        apiBaseUrl: apiEndpoint,
        apiToken,
        workspaceId,
        meetingId: selectedMeetingId,
      });
      setDetail(null);
      setExportContent("");
      setSelectedMeetingId("");
      setMessage("Meeting deleted");
      await refreshMeetings();
    } catch {
      setMessage("Meeting delete failed");
    }
  }

  return (
    <section className="meeting-review" aria-labelledby="meeting-review-title">
      <div className="meeting-review-header">
        <div>
          <p className="eyebrow">Post Session</p>
          <h2 id="meeting-review-title">Meeting review</h2>
        </div>
        <span className="status-pill muted">{meetings.length} records</span>
      </div>
      <div className="meeting-review-controls">
        <label>
          <span>API endpoint</span>
          <input
            value={apiEndpoint}
            onChange={(event) => setApiEndpoint(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Workspace</span>
          <input
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>API token</span>
          <input
            type="password"
            value={apiToken}
            onChange={(event) => setApiToken(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Search</span>
          <input
            value={transcriptQuery}
            onChange={(event) => setTranscriptQuery(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Meeting</span>
          <select
            value={selectedMeetingId}
            onChange={(event) => void loadMeeting(event.currentTarget.value)}
            disabled={!canCallApi || meetings.length === 0}
          >
            {meetings.length === 0 ? (
              <option value="">No meetings</option>
            ) : (
              meetings.map((meeting) => (
                <option value={meeting.meeting_id} key={meeting.meeting_id}>
                  {meeting.meeting_id}
                </option>
              ))
            )}
          </select>
        </label>
        <label>
          <span>Export</span>
          <select
            value={exportFormat}
            onChange={(event) =>
              setExportFormat(event.currentTarget.value as MeetingExportResponse["format"])
            }
          >
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <div className="meeting-review-buttons">
          <button type="button" onClick={() => void requestReviewToken()}>
            Get API token
          </button>
          <button type="button" disabled={!canCallApi} onClick={() => void refreshMeetings()}>
            Refresh history
          </button>
          <button
            type="button"
            disabled={!canCallApi || selectedMeetingId === ""}
            onClick={() => void runExport()}
          >
            Export
          </button>
          <button
            type="button"
            disabled={exportContent.length === 0}
            onClick={() => void copyExport()}
          >
            Copy export
          </button>
          <button
            type="button"
            disabled={!canCallApi || selectedMeetingId === ""}
            onClick={() => void deleteSelectedMeeting()}
          >
            Delete
          </button>
        </div>
      </div>
      <p className="meeting-review-detail">{message}</p>
      <dl className="meeting-review-stats">
        <div>
          <dt>Selected</dt>
          <dd>{selectedMeeting?.meeting_id ?? "None"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{selectedMeeting?.status ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Segments</dt>
          <dd>{detail?.transcript.segments.length ?? selectedMeeting?.segment_count ?? 0}</dd>
        </div>
        <div>
          <dt>Gaps</dt>
          <dd>{detail?.transcript.gaps.length ?? selectedMeeting?.gap_count ?? 0}</dd>
        </div>
      </dl>
      <div className="meeting-review-transcript" aria-live="polite">
        {detail === null ? (
          <p className="meeting-review-empty">No meeting selected</p>
        ) : detail.transcript.segments.length === 0 ? (
          <p className="meeting-review-empty">Transcript empty</p>
        ) : (
          detail.transcript.segments.map((segment) => (
            <article className="transcript-row final" key={segment.segment_id}>
              <div>
                <span>{segment.speaker}</span>
                <strong>{`${segment.start_ms}-${segment.end_ms} ms`}</strong>
              </div>
              <p>{segment.text}</p>
            </article>
          ))
        )}
        {detail?.transcript.gaps.map((gap) => (
          <article className="meeting-gap-row" key={`${gap.stream}-${gap.start_ms}`}>
            <span>{gap.stream}</span>
            <p>{`${gap.reason} / ${gap.start_ms}-${gap.end_ms} ms / ${gap.dropped_chunks} chunks`}</p>
          </article>
        ))}
      </div>
      {exportContent.length > 0 ? (
        <textarea className="meeting-review-export" readOnly value={exportContent} />
      ) : null}
    </section>
  );
}

function DiagnosticsPanel() {
  const [activeAction, setActiveAction] = useState<DiagnosticAction | null>(null);
  const [outcome, setOutcome] = useState<DiagnosticOutcome | null>(null);
  const nativeRuntimeAvailable = useMemo(() => isTauriRuntime(), []);
  const isRunning = activeAction !== null;
  const rows = outcome?.details === undefined ? [] : formatDiagnosticDetails(outcome.details);

  async function run(action: DiagnosticAction) {
    setActiveAction(action);
    setOutcome(null);

    try {
      setOutcome(await runDesktopDiagnostic(action));
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-title">
      <div className="diagnostics-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2 id="diagnostics-title">Capability QA</h2>
        </div>
        <span className={nativeRuntimeAvailable ? "status-pill ok" : "status-pill muted"}>
          {nativeRuntimeAvailable ? "Native runtime" : "Browser preview"}
        </span>
      </div>
      <div className="diagnostics-actions">
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("microphone")}
        >
          {activeAction === "microphone" ? "Running..." : "Microphone"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("outputDevices")}
        >
          {activeAction === "outputDevices" ? "Running..." : "Outputs"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("systemLoopback")}
        >
          {activeAction === "systemLoopback" ? "Running..." : "Loopback"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("localCache")}
        >
          {activeAction === "localCache" ? "Running..." : "Local cache"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("crashDiagnostics")}
        >
          {activeAction === "crashDiagnostics" ? "Running..." : "Crash diagnostics"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("realtimeWebSocket")}
        >
          {activeAction === "realtimeWebSocket" ? "Running..." : "Realtime WS"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("updatePolicy")}
        >
          {activeAction === "updatePolicy" ? "Running..." : "Update policy"}
        </button>
      </div>
      <div className="diagnostics-result" aria-live="polite">
        {outcome === null ? (
          <p className="diagnostics-placeholder">
            {nativeRuntimeAvailable ? "No probe run yet." : "Open the Tauri app for native probes."}
          </p>
        ) : (
          <>
            <p className={`diagnostics-message ${outcome.status}`}>{outcome.message}</p>
            {rows.length > 0 ? (
              <dl className="diagnostics-details">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function OverlaySurface() {
  const [snapshot, setSnapshot] = useState<DesktopRealtimeSnapshot>(initialLiveSessionSnapshot);
  const status = getLiveSessionStatusView(snapshot.status);
  const transcriptRows = toLiveTranscriptRows(snapshot.transcripts);
  const latestTranscript = transcriptRows.at(-1);

  useEffect(() => {
    const channel = openLiveSessionBroadcastChannel();
    if (channel === null) {
      return;
    }

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isLiveSessionBroadcastMessage(event.data)) {
        setSnapshot(event.data.snapshot);
      }
    };

    return () => channel.close();
  }, []);

  return (
    <main className="overlay-shell" data-tauri-drag-region>
      <section className="overlay-panel" data-tauri-drag-region>
        <div className={`overlay-status ${status.tone}`} aria-label="Capture status" />
        <div>
          <p className="overlay-eyebrow">Dokeza</p>
          <p className="overlay-title">
            {latestTranscript?.text ?? (snapshot.status === "idle" ? "Ready" : status.label)}
          </p>
          <p className="overlay-meta">
            {latestTranscript === undefined
              ? status.label
              : `${latestTranscript.speaker} / ${latestTranscript.state}`}
          </p>
        </div>
      </section>
    </main>
  );
}

function getMicrophoneCaptureLabel(snapshot: MicrophoneCaptureSnapshot): string {
  const base = `${snapshot.state} / ${snapshot.chunksSent} chunks / ${snapshot.streamTimeMs} ms`;
  if (snapshot.lastErrorCode !== undefined) {
    return `${base} / ${snapshot.lastErrorCode}`;
  }

  if (snapshot.lastGapReason !== undefined) {
    return `${base} / ${snapshot.lastGapReason}`;
  }

  return base;
}

function openLiveSessionBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  return new BroadcastChannel(liveSessionBroadcastChannel);
}

function isLiveSessionBroadcastMessage(value: unknown): value is LiveSessionBroadcastMessage {
  if (typeof value !== "object" || value === null || !("type" in value) || !("snapshot" in value)) {
    return false;
  }

  return (value as LiveSessionBroadcastMessage).type === "live-session.snapshot";
}
