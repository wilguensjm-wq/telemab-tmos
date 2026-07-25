import assert from "node:assert/strict";
import test from "node:test";
import { BroadcastEngine } from "./broadcastEngine.js";

function createManagerState() {
  return {
    status: "stopped",
    readiness: "ready",
    isRunning: false,
    pid: null,
    metrics: {},
    recentLogs: [],
    lastError: "",
  };
}

function createHarness() {
  const ffmpegState = createManagerState();
  const recordingState = {
    status: "stopped",
    durationSeconds: 0,
    currentFile: null,
    lastError: "",
  };
  const rtmpState = { enabled: false, status: "not-configured", retryCount: 0, lastError: "" };
  const srtState = { enabled: false, status: "not-configured", retryCount: 0, lastError: "" };

  const ffmpegManager = {
    onStateChange(handler) {
      this.handler = handler;
    },
    async start() {},
    async stop() {},
    async restart() {},
    getState() {
      return ffmpegState;
    },
  };

  const recordingManager = {
    stop() {
      recordingState.status = "stopped";
    },
    prepareRecordingTarget() {
      return null;
    },
    start() {
      recordingState.status = "recording";
    },
    getState() {
      return recordingState;
    },
    syncFileMetrics() {
      return recordingState;
    },
  };

  const rtmpOutputManager = {
    markStandby() {},
    markDisconnected() {},
    configure() {},
    getState() {
      return rtmpState;
    },
    incrementRetry() {},
    markConnected() {},
    updateMetrics() {},
  };

  const srtOutputManager = {
    markStandby() {},
    markDisconnected() {},
    configure() {},
    getState() {
      return srtState;
    },
    incrementRetry() {},
    markConnected() {},
    updateMetrics() {},
  };

  return new BroadcastEngine({
    ffmpegManager,
    recordingManager,
    rtmpOutputManager,
    srtOutputManager,
  });
}

test("BroadcastEngine setActiveProgram updates backend status metadata", async () => {
  const engine = createHarness();

  const status = await engine.setActiveProgram({ activeProgram: "Studio Camera 2" });

  assert.equal(status.activeProgram, "Studio Camera 2");
  assert.equal(status.engineStatus, "stopped");
});