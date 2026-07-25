import { spawn } from "node:child_process";

function trimLogBuffer(lines, limit) {
  return lines.slice(Math.max(0, lines.length - limit));
}

function parseBitrateKbps(rawValue) {
  const token = String(rawValue || "").trim().toLowerCase();
  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (token.endsWith("kbits/s")) return numeric;
  if (token.endsWith("mbits/s")) return numeric * 1000;
  if (token.endsWith("bits/s")) return numeric / 1000;
  return numeric;
}

function parseNumeric(rawValue, fallback = 0) {
  const numeric = Number.parseFloat(String(rawValue || ""));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function teeTarget(format, target, extraOptions = []) {
  const optionTokens = ["onfail=ignore", ...extraOptions].filter(Boolean).join(":");
  return `[f=${format}${optionTokens ? `:${optionTokens}` : ""}]${target}`;
}

export class FfmpegManager {
  constructor({ ffmpegPath, logger, shutdownTimeoutMs = 5000, logBufferSize = 200 }) {
    this.ffmpegPath = ffmpegPath;
    this.logger = logger;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.logBufferSize = logBufferSize;
    this.process = null;
    this.resourceTimer = null;
    this.desiredConfig = null;
    this.exitHandlerRegistered = false;
    this.expectedStop = false;
    this.listeners = new Set();

    this.state = {
      processState: "stopped",
      readiness: "ready",
      health: "idle",
      lastError: "",
      plannedCommand: "",
      pid: null,
      isRunning: false,
      exitCode: null,
      exitSignal: null,
      startedAt: null,
      lastExitAt: null,
      crashCount: 0,
      cpuUsagePct: 0,
      memoryUsagePct: 0,
      metrics: {
        bitrateKbps: 0,
        fps: 0,
        droppedFrames: 0,
        totalSizeBytes: 0,
        outTimeMs: 0,
      },
      recentLogs: [],
    };

    this.registerProcessCleanup();
  }

  onStateChange(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitStateChange() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  defineExecutionInterface({ plannedCommand = "" } = {}) {
    this.state = {
      ...this.state,
      plannedCommand: String(plannedCommand || ""),
    };

    this.emitStateChange();
    return this.getState();
  }

  buildArgs(config = {}) {
    const { recordingFilePath, rtmpOutput, srtOutput, video = {} } = config;
    const width = Number(video.width || 1280);
    const height = Number(video.height || 720);
    const fps = Number(video.fps || 30);
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-stats_period",
      "1",
      "-progress",
      "pipe:1",
      "-re",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${width}x${height}:rate=${fps}`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-g",
      String(fps * 2),
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "128k",
    ];

    const teeTargets = [];

    if (recordingFilePath) {
      teeTargets.push(teeTarget("mp4", recordingFilePath, ["movflags=+faststart"]));
    }

    if (rtmpOutput?.enabled && rtmpOutput?.endpoint) {
      teeTargets.push(teeTarget("flv", rtmpOutput.endpoint));
    }

    if (srtOutput?.enabled && srtOutput?.endpoint) {
      teeTargets.push(teeTarget("mpegts", srtOutput.endpoint));
    }

    if (teeTargets.length === 0) {
      args.push("-f", "null", "-");
    } else if (teeTargets.length === 1) {
      const target = teeTargets[0];
      const matched = target.match(/^\[f=([^\]:]+)(?::([^\]]+))?\](.*)$/);
      if (matched) {
        const [, format, optionString, outputTarget] = matched;
        if (optionString?.includes("movflags=+faststart")) {
          args.push("-movflags", "+faststart");
        }
        args.push("-f", format, outputTarget);
      }
    } else {
      args.push("-f", "tee", teeTargets.join("|"));
    }

    return args;
  }

  appendLog(stream, line) {
    this.state = {
      ...this.state,
      recentLogs: trimLogBuffer([
        ...this.state.recentLogs,
        {
          timestamp: new Date().toISOString(),
          stream,
          line,
        },
      ], this.logBufferSize),
    };
  }

  parseProgressChunk(chunk) {
    const content = String(chunk || "");
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return;
    }

    const metrics = { ...this.state.metrics };
    for (const line of lines) {
      if (!line.includes("=")) {
        continue;
      }
      const [key, rawValue] = line.split("=");
      if (key === "bitrate") metrics.bitrateKbps = parseBitrateKbps(rawValue);
      if (key === "fps") metrics.fps = parseNumeric(rawValue, metrics.fps);
      if (key === "drop_frames") metrics.droppedFrames = parseNumeric(rawValue, metrics.droppedFrames);
      if (key === "total_size") metrics.totalSizeBytes = parseNumeric(rawValue, metrics.totalSizeBytes);
      if (key === "out_time_ms") metrics.outTimeMs = parseNumeric(rawValue, metrics.outTimeMs) / 1000;
    }

    this.state = {
      ...this.state,
      metrics,
    };
    this.emitStateChange();
  }

  startResourceSampling() {
    this.stopResourceSampling();
    this.resourceTimer = setInterval(() => {
      if (!this.process?.pid) {
        return;
      }

      const probe = spawn("ps", ["-p", String(this.process.pid), "-o", "%cpu=,%mem="]);
      let output = "";

      probe.stdout.on("data", (chunk) => {
        output += String(chunk || "");
      });

      probe.on("close", () => {
        const [cpuToken, memoryToken] = output.trim().split(/\s+/);
        this.state = {
          ...this.state,
          cpuUsagePct: parseNumeric(cpuToken, this.state.cpuUsagePct),
          memoryUsagePct: parseNumeric(memoryToken, this.state.memoryUsagePct),
        };
        this.emitStateChange();
      });
    }, 1000);
  }

  stopResourceSampling() {
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer);
      this.resourceTimer = null;
    }
  }

  registerProcessCleanup() {
    if (this.exitHandlerRegistered) {
      return;
    }

    this.exitHandlerRegistered = true;
    process.once("exit", () => {
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
    });
  }

  async start(config = {}) {
    if (this.process) {
      return this.getState();
    }

    const args = this.buildArgs(config);
    this.desiredConfig = config;
    this.expectedStop = false;

    this.process = spawn(this.ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.state = {
      ...this.state,
      processState: "running",
      readiness: "ready",
      health: "running",
      lastError: "",
      pid: this.process.pid,
      isRunning: true,
      exitCode: null,
      exitSignal: null,
      startedAt: new Date().toISOString(),
      plannedCommand: `${this.ffmpegPath} ${args.join(" ")}`,
      metrics: {
        bitrateKbps: 0,
        fps: 0,
        droppedFrames: 0,
        totalSizeBytes: 0,
        outTimeMs: 0,
      },
      recentLogs: [],
    };

    this.logger?.info("broadcast.ffmpeg.start", {
      pid: this.process.pid,
      command: this.state.plannedCommand,
    });

    this.process.stdout.on("data", (chunk) => {
      this.parseProgressChunk(chunk);
    });

    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (!text) {
        return;
      }

      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.appendLog("stderr", line.trim());
      }
      this.emitStateChange();
    });

    this.process.on("error", (error) => {
      this.state = {
        ...this.state,
        processState: "crashed",
        readiness: "not-ready",
        health: "degraded",
        lastError: error?.message || "Failed to launch FFmpeg",
      };
      this.appendLog("stderr", this.state.lastError);
      this.emitStateChange();
    });

    this.process.on("close", (code, signal) => {
      const unexpected = !this.expectedStop;
      this.stopResourceSampling();
      this.process = null;
      this.state = {
        ...this.state,
        processState: unexpected ? "crashed" : "stopped",
        readiness: unexpected ? "not-ready" : "ready",
        health: unexpected ? "degraded" : "idle",
        pid: null,
        isRunning: false,
        exitCode: code,
        exitSignal: signal,
        lastExitAt: new Date().toISOString(),
        crashCount: unexpected ? this.state.crashCount + 1 : this.state.crashCount,
        lastError: unexpected && !this.state.lastError
          ? `FFmpeg exited unexpectedly (${code ?? "null"}/${signal ?? "none"})`
          : this.state.lastError,
      };
      this.logger?.info("broadcast.ffmpeg.exit", {
        code,
        signal,
        unexpected,
      });
      this.emitStateChange();
    });

    this.startResourceSampling();
    this.emitStateChange();
    return this.getState();
  }

  async stop() {
    if (!this.process) {
      this.state = {
        ...this.state,
        processState: "stopped",
        isRunning: false,
      };
      this.emitStateChange();
      return this.getState();
    }

    this.expectedStop = true;
    const currentProcess = this.process;
    currentProcess.stdin.write("q\n");

    await new Promise((resolve) => {
      let settled = false;
      const finalize = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      currentProcess.once("close", finalize);

      setTimeout(() => {
        if (currentProcess.exitCode === null && !currentProcess.killed) {
          currentProcess.kill("SIGTERM");
        }

        setTimeout(() => {
          if (currentProcess.exitCode === null && !currentProcess.killed) {
            currentProcess.kill("SIGKILL");
          }
          finalize();
        }, Math.max(1000, Math.floor(this.shutdownTimeoutMs / 2)));
      }, this.shutdownTimeoutMs);
    });

    return this.getState();
  }

  async restart(config = this.desiredConfig) {
    await this.stop();
    return this.start(config);
  }

  markError(message) {
    this.state = {
      ...this.state,
      readiness: "not-ready",
      health: "degraded",
      lastError: String(message || "Unknown FFmpeg manager error"),
    };

    this.appendLog("stderr", this.state.lastError);
    this.emitStateChange();
    return this.getState();
  }

  clearError() {
    this.state = {
      ...this.state,
      readiness: "ready",
      health: ["stopped", "crashed"].includes(this.state.processState) ? "idle" : "running",
      lastError: "",
    };

    this.emitStateChange();
    return this.getState();
  }

  status() {
    return this.getState();
  }

  health() {
    return {
      processState: this.state.processState,
      readiness: this.state.readiness,
      health: this.state.health,
      pid: this.state.pid,
      cpuUsagePct: this.state.cpuUsagePct,
      memoryUsagePct: this.state.memoryUsagePct,
      metrics: { ...this.state.metrics },
      lastError: this.state.lastError,
    };
  }

  logs() {
    return [...this.state.recentLogs];
  }

  getState() {
    return {
      ...this.state,
      metrics: { ...this.state.metrics },
      recentLogs: [...this.state.recentLogs],
    };
  }
}
