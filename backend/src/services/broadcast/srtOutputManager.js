import { TmosError } from "../../errors/TmosError.js";

export class SrtOutputManager {
  constructor() {
    this.state = {
      status: "not-configured",
      endpoint: "",
      mode: "caller",
      latencyMs: 120,
      passphraseRef: "",
      lastError: "",
      updatedAt: null,
    };
  }

  configure({ endpoint, mode = "caller", latencyMs = 120, passphraseRef = "" } = {}) {
    const normalizedEndpoint = String(endpoint || "").trim();
    if (!normalizedEndpoint) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "SRT endpoint is required",
        status: 400,
        details: { field: "endpoint" },
      });
    }

    const parsedLatency = Number(latencyMs);
    const safeLatency = Number.isFinite(parsedLatency) && parsedLatency >= 0 ? parsedLatency : 120;

    this.state = {
      ...this.state,
      status: "configured",
      endpoint: normalizedEndpoint,
      mode: String(mode || "caller"),
      latencyMs: safeLatency,
      passphraseRef: String(passphraseRef || ""),
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
      lastError: String(message || "Unknown SRT output error"),
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
