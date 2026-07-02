import {
  createDokezaAuthTokenService,
  type DokezaAuthTokenServiceOptions,
} from "@dokeza/auth";
import type { TokenValidator, RealtimeAuthContext } from "./ws-server.js";

export class DokezaRealtimeTokenValidator implements TokenValidator {
  private readonly tokenService;

  constructor(options: DokezaAuthTokenServiceOptions) {
    this.tokenService = createDokezaAuthTokenService(options);
  }

  async validate(token: string): Promise<RealtimeAuthContext | undefined> {
    const result = this.tokenService.validateToken(token, "realtime_session");
    if (!result.ok || result.principal.workspaceId === undefined) {
      return undefined;
    }

    return {
      actor: result.principal.actor,
      workspaceId: result.principal.workspaceId,
      ...(result.principal.deviceId === undefined ? {} : { deviceId: result.principal.deviceId }),
    };
  }
}

export function createDokezaRealtimeTokenValidator(
  options: DokezaAuthTokenServiceOptions,
): DokezaRealtimeTokenValidator {
  return new DokezaRealtimeTokenValidator(options);
}
