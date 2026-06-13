import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export interface ModelGatewayRequest {
  workspaceId: string;
  task: "live_suggestion" | "post_call_summary" | "embedding";
  promptVersion: string;
  provider: "openai";
}

export interface ModelGatewayRoute {
  provider: "openai";
  externalCallEnabled: false;
  telemetry: TelemetryEvent;
}

export function routeModelRequest(request: ModelGatewayRequest): ModelGatewayRoute {
  return {
    provider: request.provider,
    externalCallEnabled: false,
    telemetry: createTelemetryEvent("ai.model_route_selected", {
      workspaceId: request.workspaceId,
      task: request.task,
      promptVersion: request.promptVersion,
      provider: request.provider,
    }),
  };
}
