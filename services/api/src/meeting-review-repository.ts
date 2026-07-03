import type {
  MeetingDeleteResponse,
  MeetingDetailResponse,
  MeetingExportResponse,
  MeetingHistoryResponse,
  MeetingSummary,
  MeetingTranscriptGap,
  MeetingTranscriptSegment,
} from "@dokeza/contracts";

export type MeetingExportFormat = MeetingExportResponse["format"];

export interface MeetingReviewRepository {
  listMeetings(workspaceId: string): Promise<MeetingHistoryResponse>;
  getMeetingDetail(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse | undefined>;
  exportMeeting(
    workspaceId: string,
    meetingId: string,
    format: MeetingExportFormat,
  ): Promise<MeetingExportResponse | undefined>;
  deleteMeeting(workspaceId: string, meetingId: string): Promise<MeetingDeleteResponse | undefined>;
}

export interface MeetingReviewSeed {
  meeting: MeetingSummary;
  segments?: MeetingTranscriptSegment[];
  gaps?: MeetingTranscriptGap[];
}

interface StoredMeetingReview {
  meeting: MeetingSummary;
  segments: MeetingTranscriptSegment[];
  gaps: MeetingTranscriptGap[];
}

export class InMemoryMeetingReviewRepository implements MeetingReviewRepository {
  private readonly meetings = new Map<string, StoredMeetingReview>();

  constructor(seeds: MeetingReviewSeed[] = []) {
    for (const seed of seeds) {
      this.upsert(seed);
    }
  }

  upsert(seed: MeetingReviewSeed): void {
    this.meetings.set(key(seed.meeting.workspace_id, seed.meeting.meeting_id), {
      meeting: {
        ...seed.meeting,
        segment_count: seed.segments?.length ?? seed.meeting.segment_count,
        gap_count: seed.gaps?.length ?? seed.meeting.gap_count,
      },
      segments: [...(seed.segments ?? [])],
      gaps: [...(seed.gaps ?? [])],
    });
  }

  async listMeetings(workspaceId: string): Promise<MeetingHistoryResponse> {
    const meetings = [...this.meetings.values()]
      .filter((entry) => entry.meeting.workspace_id === workspaceId)
      .map((entry) => entry.meeting)
      .sort(compareMeetingSummaries);

    return { workspace_id: workspaceId, meetings };
  }

  async getMeetingDetail(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse | undefined> {
    const stored = this.meetings.get(key(workspaceId, meetingId));
    if (stored === undefined) {
      return undefined;
    }

    return {
      meeting: stored.meeting,
      transcript: {
        segments: [...stored.segments].sort(
          (left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms,
        ),
        gaps: [...stored.gaps].sort(
          (left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms,
        ),
      },
    };
  }

  async exportMeeting(
    workspaceId: string,
    meetingId: string,
    format: MeetingExportFormat,
  ): Promise<MeetingExportResponse | undefined> {
    const detail = await this.getMeetingDetail(workspaceId, meetingId);
    if (detail === undefined) {
      return undefined;
    }

    return {
      meeting_id: meetingId,
      workspace_id: workspaceId,
      format,
      content_type: format === "markdown" ? "text/markdown" : "application/json",
      content:
        format === "markdown"
          ? toMarkdownExport(detail)
          : JSON.stringify(
              {
                meeting: detail.meeting,
                transcript: detail.transcript,
              },
              null,
              2,
            ),
    };
  }

  async deleteMeeting(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDeleteResponse | undefined> {
    const deleted = this.meetings.delete(key(workspaceId, meetingId));
    if (!deleted) {
      return undefined;
    }

    return {
      meeting_id: meetingId,
      workspace_id: workspaceId,
      deleted: true,
    };
  }
}

function key(workspaceId: string, meetingId: string): string {
  return `${workspaceId}\0${meetingId}`;
}

function compareMeetingSummaries(left: MeetingSummary, right: MeetingSummary): number {
  const leftTime = left.started_at ?? "";
  const rightTime = right.started_at ?? "";
  return rightTime.localeCompare(leftTime) || right.meeting_id.localeCompare(left.meeting_id);
}

function toMarkdownExport(detail: MeetingDetailResponse): string {
  const lines = [
    `# Meeting ${detail.meeting.meeting_id}`,
    "",
    `- Workspace: ${detail.meeting.workspace_id}`,
    `- Source: ${detail.meeting.meeting_source}`,
    `- Status: ${detail.meeting.status}`,
  ];

  if (detail.meeting.started_at !== undefined) {
    lines.push(`- Started: ${detail.meeting.started_at}`);
  }
  if (detail.meeting.ended_at !== undefined) {
    lines.push(`- Ended: ${detail.meeting.ended_at}`);
  }

  lines.push("", "## Transcript", "");

  if (detail.transcript.segments.length === 0) {
    lines.push("_No transcript segments._");
  } else {
    for (const segment of detail.transcript.segments) {
      lines.push(`- ${segment.start_ms}-${segment.end_ms} ms [${segment.speaker}] ${segment.text}`);
    }
  }

  if (detail.transcript.gaps.length > 0) {
    lines.push("", "## Gaps", "");
    for (const gap of detail.transcript.gaps) {
      lines.push(
        `- ${gap.start_ms}-${gap.end_ms} ms ${gap.stream}: ${gap.reason} (${gap.dropped_chunks} chunks)`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
