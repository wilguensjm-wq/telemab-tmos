import { TmosError } from "../../errors/TmosError.js";

export class BroadcastEngine {
  constructor({ ffmpegManager, recordingManager, rtmpOutputManager, srtOutputManager, autoRestartDelayMs = 1500 }) {
    this.ffmpegManager = ffmpegManager;
    this.recordingManager = recordingManager;
    this.rtmpOutputManager = rtmpOutputManager;
    this.srtOutputManager = srtOutputManager;
    this.healthService = null;
    this.autoRestartDelayMs = autoRestartDelayMs;
    this.recoveryTimer = null;

    this.state = {
      engineStatus: "stopped",
      activeProgram: "Program standby",
      startedAt: null,
      lastError: "",
    };

    this.ffmpegManager.onStateChange((snapshot) => {
      if (snapshot.processState === "crashed" && this.state.engineStatus === "running") {
        this.handleUnexpectedExit();
      }
    });
  }

  setHealthService(healthService) {
    this.healthService = healthService;
  }

  async start({ activeProgram } = {}) {
    const nextProgram = String(activeProgram || this.state.activeProgram || "Program standby");

    this.state = {
      ...this.state,
      engineStatus: "running",
      startedAt: this.state.startedAt || new Date().toISOString(),
      activeProgram: nextProgram,
      lastError: "",
    };

    this.rtmpOutputManager.markStandby();
    this.srtOutputManager.markStandby();
    await this.ffmpegManager.start(this.buildFfmpegConfig());

    return this.getStatus();
  }

  async stop() {
    this.recordingManager.stop();
    this.rtmpOutputManager.markDisconnected();
    this.srtOutputManager.markDisconnected();
    await this.ffmpegManager.stop();

    this.state = {
      ...this.state,
      engineStatus: "stopped",
      startedAt: null,
      activeProgram: "Program standby",
      lastError: "",
    };

    return this.getStatus();
  }

  async startRecording() {
    this.assertRunning("start recording");
    const filePath = this.recordingManager.prepareRecordingTarget();
    this.recordingManager.start(filePath);
    await this.ffmpegManager.restart(this.buildFfmpegConfig());
    return this.getStatus();
  }

  async stopRecording() {
    this.recordingManager.stop();
    if (this.state.engineStatus === "running") {
      await this.ffmpegManager.restart(this.buildFfmpegConfig());
    }
    return this.getStatus();
  }

  async configureRtmp(payload = {}) {
    this.rtmpOutputManager.configure(payload);
    if (this.state.engineStatus === "running") {
      await this.ffmpegManager.restart(this.buildFfmpegConfig());
    }
    return this.getStatus();
  }

  async configureSrt(payload = {}) {
    this.srtOutputManager.configure(payload);
    if (this.state.engineStatus === "running") {
      await this.ffmpegManager.restart(this.buildFfmpegConfig());
    }
    return this.getStatus();
  }

  async restart() {
    this.assertRunning("restart FFmpeg");
    await this.ffmpegManager.restart(this.buildFfmpegConfig());
    return this.getStatus();
  }

  async setActiveProgram({ activeProgram } = {}) {
    this.state = {
      ...this.state,
      activeProgram: String(activeProgram || "Program standby"),
    };

    return this.getStatus();
  }

  refresh() {
    this.recordingManager.syncFileMetrics();
    return this.getStatus();
  }

  buildFfmpegConfig() {
    return {
      activeProgram: this.state.activeProgram,
      recordingFilePath: this.recordingManager.getState().status === "recording"
        ? this.recordingManager.getState().currentFile
        : null,
      rtmpOutput: this.rtmpOutputManager.getState(),
      srtOutput: this.srtOutputManager.getState(),
    };
  }

  async handleUnexpectedExit() {
    this.state = {
      ...this.state,
      lastError: this.ffmpegManager.getState().lastError || "FFmpeg exited unexpectedly",
    };

    if (this.recordingManager.getState().status === "recording") {
      const rotatedPath = this.recordingManager.rotateRecordingTarget();
      this.recordingManager.start(rotatedPath);
    }

    const rtmpState = this.rtmpOutputManager.getState();
    const srtState = this.srtOutputManager.getState();

    if (rtmpState.enabled) {
      this.rtmpOutputManager.incrementRetry();
      this.rtmpOutputManager.markDisconnected(this.state.lastError);
    }

    if (srtState.enabled) {
      this.srtOutputManager.incrementRetry();
      this.srtOutputManager.markDisconnected(this.state.lastError);
    }

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    if (this.state.engineStatus === "running") {
      this.recoveryTimer = setTimeout(() => {
        this.ffmpegManager.start(this.buildFfmpegConfig()).catch((error) => {
          this.state = {
            ...this.state,
            lastError: error?.message || "Automatic FFmpeg restart failed",
          };
        });
      }, this.autoRestartDelayMs);
    }
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
    const ffmpegState = this.ffmpegManager.getState();
    const hasActiveMediaFlow = Number(ffmpegState.metrics?.outTimeMs || 0) > 0;
    const recentLogText = (ffmpegState.recentLogs || []).map((entry) => entry.line || "").join("\n");
    const hasRtmpFailure = /rtmp:\/\/|flv/i.test(recentLogText) && /error opening output|failed/i.test(recentLogText);
    const hasSrtFailure = /srt:\/\//i.test(recentLogText) && /error opening output|failed/i.test(recentLogText);

    if (ffmpegState.isRunning) {
      if (this.rtmpOutputManager.getState().enabled && hasRtmpFailure) {
        this.rtmpOutputManager.markDisconnected("RTMP output unavailable");
      } else if (this.rtmpOutputManager.getState().enabled && hasActiveMediaFlow) {
        this.rtmpOutputManager.markConnected();
        this.rtmpOutputManager.updateMetrics(ffmpegState.metrics);
      }
      if (this.srtOutputManager.getState().enabled && hasSrtFailure) {
        this.srtOutputManager.markDisconnected("SRT output unavailable");
      } else if (this.srtOutputManager.getState().enabled && hasActiveMediaFlow) {
        this.srtOutputManager.markConnected();
        this.srtOutputManager.updateMetrics(ffmpegState.metrics);
      }
      this.recordingManager.syncFileMetrics();
    }

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
