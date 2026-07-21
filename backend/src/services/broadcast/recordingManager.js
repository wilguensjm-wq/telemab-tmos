export class RecordingManager {
  constructor() {
    this.state = {
      status: "stopped",
      startedAt: null,
      accumulatedDurationMs: 0,
      lastError: "",
    };
  }

  start() {
    if (this.state.status === "recording") {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "recording",
      startedAt: new Date().toISOString(),
      lastError: "",
    };

    return this.getState();
  }

  stop() {
    if (this.state.status !== "recording") {
      return this.getState();
    }

    const now = Date.now();
    const startedAt = this.state.startedAt ? Date.parse(this.state.startedAt) : now;
    const additionalMs = Math.max(0, now - startedAt);

    this.state = {
      ...this.state,
      status: "stopped",
      startedAt: null,
      accumulatedDurationMs: this.state.accumulatedDurationMs + additionalMs,
    };

    return this.getState();
  }

  resetDuration() {
    this.state = {
      ...this.state,
      accumulatedDurationMs: 0,
      startedAt: this.state.status === "recording" ? new Date().toISOString() : null,
    };

    return this.getState();
  }

  markError(message) {
    this.state = {
      ...this.state,
      lastError: String(message || "Unknown recording manager error"),
    };

    return this.getState();
  }

  getState() {
    const now = Date.now();
    const startedAtMs = this.state.startedAt ? Date.parse(this.state.startedAt) : null;
    const activeDurationMs = this.state.status === "recording" && startedAtMs
      ? Math.max(0, now - startedAtMs)
      : 0;

    const durationSeconds = Math.floor((this.state.accumulatedDurationMs + activeDurationMs) / 1000);

    return {
      status: this.state.status,
      startedAt: this.state.startedAt,
      durationSeconds,
      lastError: this.state.lastError,
    };
  }
}
