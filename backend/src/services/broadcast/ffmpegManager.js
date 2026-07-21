export class FfmpegManager {
  constructor() {
    this.state = {
      processState: "not-started",
      readiness: "ready",
      health: "idle",
      lastError: "",
      plannedCommand: "",
    };
  }

  defineExecutionInterface({ plannedCommand = "" } = {}) {
    this.state = {
      ...this.state,
      plannedCommand: String(plannedCommand || ""),
    };

    return this.getState();
  }

  markPreparing() {
    this.state = {
      ...this.state,
      processState: "standby",
      readiness: "ready",
      health: "standby",
      lastError: "",
    };

    return this.getState();
  }

  markStopped() {
    this.state = {
      ...this.state,
      processState: "not-started",
      readiness: "ready",
      health: "idle",
    };

    return this.getState();
  }

  markError(message) {
    this.state = {
      ...this.state,
      readiness: "not-ready",
      health: "degraded",
      lastError: String(message || "Unknown FFmpeg manager error"),
    };

    return this.getState();
  }

  clearError() {
    this.state = {
      ...this.state,
      readiness: "ready",
      health: this.state.processState === "not-started" ? "idle" : "standby",
      lastError: "",
    };

    return this.getState();
  }

  getState() {
    return {
      ...this.state,
    };
  }
}
