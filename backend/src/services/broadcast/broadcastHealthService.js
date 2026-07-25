import os from "node:os";

function cpuUsagePercent() {
  const cpus = os.cpus() || [];
  const count = cpus.length || 1;
  const load = os.loadavg()?.[0] || 0;
  return Math.max(0, Math.min(100, (load / count) * 100));
}

function memoryUsagePercent() {
  const used = process.memoryUsage().rss;
  const total = os.totalmem() || 1;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

export class BroadcastHealthService {
  constructor({ broadcastEngine, ffmpegManager, recordingManager, rtmpOutputManager, srtOutputManager }) {
    this.broadcastEngine = broadcastEngine;
    this.ffmpegManager = ffmpegManager;
    this.recordingManager = recordingManager;
    this.rtmpOutputManager = rtmpOutputManager;
    this.srtOutputManager = srtOutputManager;
  }

  getStatus() {
    const baseState = this.broadcastEngine.getEngineState();
    const ffmpegState = this.ffmpegManager.getState();
    const recordingState = this.recordingManager.getState();
    const rtmpState = this.rtmpOutputManager.getState();
    const srtState = this.srtOutputManager.getState();

    const lastError = [
      baseState.lastError,
      recordingState.lastError,
      rtmpState.lastError,
      srtState.lastError,
      ffmpegState.lastError,
    ].find((item) => Boolean(item)) || "";

    return {
      engineStatus: baseState.engineStatus,
      recordingStatus: recordingState.status,
      rtmpStatus: rtmpState.status,
      srtStatus: srtState.status,
      ffmpegReadiness: ffmpegState.readiness,
      ffmpegRunning: Boolean(ffmpegState.isRunning),
      activeProgram: baseState.activeProgram,
      ffmpegPid: ffmpegState.pid,
      cpuUsagePct: Number((ffmpegState.cpuUsagePct || cpuUsagePercent()).toFixed(2)),
      memoryUsagePct: Number((ffmpegState.memoryUsagePct || memoryUsagePercent()).toFixed(2)),
      bitrateKbps: Number(ffmpegState.metrics?.bitrateKbps || 0),
      fps: Number(ffmpegState.metrics?.fps || 0),
      droppedFrames: Number(ffmpegState.metrics?.droppedFrames || 0),
      reconnectCount: Number((rtmpState.retryCount || 0) + (srtState.retryCount || 0)),
      uptimeSeconds: baseState.uptimeSeconds,
      lastError,
      details: {
        ffmpeg: ffmpegState,
        recording: recordingState,
        rtmp: rtmpState,
        srt: srtState,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}
