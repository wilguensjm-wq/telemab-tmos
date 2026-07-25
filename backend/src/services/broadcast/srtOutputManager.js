import { TmosError } from "../../errors/TmosError.js";

export class SrtOutputManager {
  constructor() {
    this.state = {
      status: "not-configured",
      endpoint: "",
      mode: "caller",
      latencyMs: 120,
      passphraseRef: "",
      enabled: false,
      retryCount: 0,
      bitrateKbps: 0,
      fps: 0,
      packetLossPct: 0,
      connectedAt: null,
      lastError: "",
      updatedAt: null,
    };
  }

  configure({ endpoint, mode = "caller", latencyMs = 120, passphraseRef = "", enabled = true } = {}) {
    const normalizedEndpoint = String(endpoint || this.state.endpoint || "").trim();
    if (!normalizedEndpoint && enabled !== false) {
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
      status: enabled === false ? "disabled" : "configured",
      endpoint: normalizedEndpoint,
      mode: String(mode || "caller"),
      latencyMs: safeLatency,
      passphraseRef: String(passphraseRef || ""),
      enabled: enabled !== false,
      lastError: "",
      updatedAt: new Date().toISOString(),
    };

    return this.getState();
  }

  markStandby() {
    this.state = {
      ...this.state,
      status: this.state.enabled
        ? (this.state.endpoint ? "connecting" : "not-configured")
        : "disabled",
      lastError: "",
    };
    return this.getState();
  }

  markConnected() {
    this.state = {
      ...this.state,
      status: "connected",
      connectedAt: this.state.connectedAt || new Date().toISOString(),
      lastError: "",
      updatedAt: new Date().toISOString(),
    };
    return this.getState();
  }

  markDisconnected(message = "") {
    this.state = {
      ...this.state,
      status: this.state.enabled ? "disconnected" : "disabled",
      connectedAt: null,
      lastError: String(message || this.state.lastError || ""),
      updatedAt: new Date().toISOString(),
    };
    return this.getState();
  }

  incrementRetry() {
    this.state = {
      ...this.state,
      retryCount: this.state.retryCount + 1,
      updatedAt: new Date().toISOString(),
    };
    return this.getState();
  }

  updateMetrics({ bitrateKbps, fps, packetLossPct } = {}) {
    this.state = {
      ...this.state,
      bitrateKbps: Number.isFinite(Number(bitrateKbps)) ? Number(bitrateKbps) : this.state.bitrateKbps,
      fps: Number.isFinite(Number(fps)) ? Number(fps) : this.state.fps,
      packetLossPct: Number.isFinite(Number(packetLossPct)) ? Number(packetLossPct) : this.state.packetLossPct,
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
    const connectedAtMs = this.state.connectedAt ? Date.parse(this.state.connectedAt) : null;
    const uptimeSeconds = connectedAtMs ? Math.floor(Math.max(0, Date.now() - connectedAtMs) / 1000) : 0;

    return {
      ...this.state,
      readiness: this.state.endpoint ? "ready" : "not-ready",
      uptimeSeconds,
    };
  }
}
