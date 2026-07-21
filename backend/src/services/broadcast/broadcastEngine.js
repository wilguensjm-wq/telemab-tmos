import { TmosError } from "../../errors/TmosError.js";

export class BroadcastEngine {
  constructor({ ffmpegManager, recordingManager, rtmpOutputManager, srtOutputManager }) {
    this.ffmpegManager = ffmpegManager;
    this.recordingManager = recordingManager;
    this.rtmpOutputManager = rtmpOutputManager;
    this.srtOutputManager = srtOutputManager;
    this.healthService = null;

    this.state = {
      engineStatus: "stopped",
      activeProgram: "Program standby",
      startedAt: null,
      lastError: "",
    };
  }

  setHealthService(healthService) {
    this.healthService = healthService;
  }

  start({ activeProgram } = {}) {
    this.state = {
      ...this.state,
      engineStatus: "running",
      startedAt: this.state.startedAt || new Date().toISOString(),
      activeProgram: String(activeProgram || this.state.activeProgram || "Program standby"),
      lastError: "",
    };

    this.ffmpegManager.markPreparing();
    this.rtmpOutputManager.markStandby();
    this.srtOutputManager.markStandby();

    return this.getStatus();
  }

  stop() {
    this.recordingManager.stop();
    this.ffmpegManager.markStopped();

    this.state = {
      ...this.state,
      engineStatus: "stopped",
      startedAt: null,
      activeProgram: "Program standby",
      lastError: "",
    };

    return this.getStatus();
  }

  startRecording() {
    this.assertRunning("start recording");
    this.recordingManager.start();
    return this.getStatus();
  }

  stopRecording() {
    this.recordingManager.stop();
    return this.getStatus();
  }

  configureRtmp(payload = {}) {
    this.rtmpOutputManager.configure(payload);
    return this.getStatus();
  }

  configureSrt(payload = {}) {
    this.srtOutputManager.configure(payload);
    return this.getStatus();
  }

  getEngineState() {
    const startedAtMs = this.state.startedAt ? Date.parse(this.state.startedAt) : null;
    const uptimeSeconds = startedAtMs ? Math.floor(Math.max(0, Date.now() - startedAtMs) / 1000) : 0;

    return {
      ...this.state,
      uptimeSeconds,
    };
  }

  getStatus() {
    if (this.healthService) {
      return this.healthService.getStatus();
    }

    return {
      ...this.getEngineState(),
      recordingStatus: this.recordingManager.getState().status,
      rtmpStatus: this.rtmpOutputManager.getState().status,
      srtStatus: this.srtOutputManager.getState().status,
      ffmpegReadiness: this.ffmpegManager.getState().readiness,
      cpuUsagePct: 0,
      memoryUsagePct: 0,
      lastError: this.state.lastError,
    };
  }

  assertRunning(action) {
    if (this.state.engineStatus === "running") {
      return;
    }

    throw new TmosError({
      code: "VALIDATION_ERROR",
      message: `Broadcast Engine must be running before ${action}`,
      status: 400,
    });
  }
}
