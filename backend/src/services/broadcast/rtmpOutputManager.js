import { TmosError } from "../../errors/TmosError.js";

export class RtmpOutputManager {
  constructor() {
    this.state = {
      status: "not-configured",
      endpoint: "",
      streamKeyRef: "",
      lastError: "",
      updatedAt: null,
    };
  }

  configure({ endpoint, streamKeyRef } = {}) {
    const normalizedEndpoint = String(endpoint || "").trim();
    if (!normalizedEndpoint) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "RTMP endpoint is required",
        status: 400,
        details: { field: "endpoint" },
      });
    }

    this.state = {
      ...this.state,
      status: "configured",
      endpoint: normalizedEndpoint,
      streamKeyRef: String(streamKeyRef || ""),
      lastError: "",
      updatedAt: new Date().toISOString(),
    };

    return this.getState();
  }

  markStandby() {
    this.state = {
      ...this.state,
      status: this.state.endpoint ? "configured" : "not-configured",
      lastError: "",
    };
    return this.getState();
  }

  markError(message) {
    this.state = {
      ...this.state,
      status: "degraded",
      lastError: String(message || "Unknown RTMP output error"),
      updatedAt: new Date().toISOString(),
    };

    return this.getState();
  }

  getState() {
    return {
      ...this.state,
      readiness: this.state.endpoint ? "ready" : "not-ready",
    };
  }
}
