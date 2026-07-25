import fs from "node:fs";
import path from "node:path";

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function bytesForFile(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function scanDirectoryBytes(rootPath) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return 0;
  }

  let total = 0;
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      total += scanDirectoryBytes(nextPath);
    } else if (entry.isFile()) {
      total += bytesForFile(nextPath);
    }
  }
  return total;
}

function buildRecordingPath(rootPath, now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const directory = path.join(rootPath, year, month, day);
  ensureDirectory(directory);
  return path.join(directory, `recording-${timestamp}.mp4`);
}

export class RecordingManager {
  constructor({ recordingsRoot }) {
    this.recordingsRoot = recordingsRoot;
    this.state = {
      status: "stopped",
      startedAt: null,
      accumulatedDurationMs: 0,
      currentFile: null,
      currentSizeBytes: 0,
      history: [],
      lastError: "",
    };
  }

  prepareRecordingTarget() {
    const nextFile = buildRecordingPath(this.recordingsRoot);
    this.state = {
      ...this.state,
      currentFile: nextFile,
      currentSizeBytes: 0,
      lastError: "",
    };
    return nextFile;
  }

  rotateRecordingTarget() {
    const previousFile = this.state.currentFile;
    const previousSizeBytes = previousFile ? bytesForFile(previousFile) : 0;
    if (previousFile) {
      this.state = {
        ...this.state,
        history: [
          {
            filePath: previousFile,
            sizeBytes: previousSizeBytes,
            durationSeconds: this.getState().durationSeconds,
            stoppedAt: new Date().toISOString(),
          },
          ...this.state.history,
        ].slice(0, 20),
      };
    }

    return this.prepareRecordingTarget();
  }

  start(filePath = this.state.currentFile) {
    if (this.state.status === "recording") {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "recording",
      startedAt: new Date().toISOString(),
      currentFile: filePath,
      currentSizeBytes: filePath ? bytesForFile(filePath) : 0,
      lastError: "",
    };

    return this.getState();
  }

  pause() {
    if (this.state.status !== "recording") {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "paused",
    };

    return this.getState();
  }

  resume() {
    if (this.state.status !== "paused") {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "recording",
    };

    return this.getState();
  }

  stop() {
    if (!["recording", "paused"].includes(this.state.status)) {
      return this.getState();
    }

    const now = Date.now();
    const startedAt = this.state.startedAt ? Date.parse(this.state.startedAt) : now;
    const additionalMs = Math.max(0, now - startedAt);
    const currentFile = this.state.currentFile;
    const currentSizeBytes = currentFile ? bytesForFile(currentFile) : this.state.currentSizeBytes;
    const historyEntry = currentFile
      ? {
          filePath: currentFile,
          sizeBytes: currentSizeBytes,
          durationSeconds: Math.floor((this.state.accumulatedDurationMs + additionalMs) / 1000),
          stoppedAt: new Date().toISOString(),
        }
      : null;

    this.state = {
      ...this.state,
      status: "stopped",
      startedAt: null,
      accumulatedDurationMs: this.state.accumulatedDurationMs + additionalMs,
      currentSizeBytes,
      history: historyEntry ? [historyEntry, ...this.state.history].slice(0, 20) : this.state.history,
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

  syncFileMetrics(filePath = this.state.currentFile) {
    if (!filePath) {
      return this.getState();
    }

    this.state = {
      ...this.state,
      currentSizeBytes: bytesForFile(filePath),
    };

    return this.getState();
  }

  getState() {
    const now = Date.now();
    const startedAtMs = this.state.startedAt ? Date.parse(this.state.startedAt) : null;
    const activeDurationMs = ["recording", "paused"].includes(this.state.status) && startedAtMs
      ? Math.max(0, now - startedAtMs)
      : 0;

    const durationSeconds = Math.floor((this.state.accumulatedDurationMs + activeDurationMs) / 1000);

    return {
      status: this.state.status,
      startedAt: this.state.startedAt,
      durationSeconds,
      currentFile: this.state.currentFile,
      currentSizeBytes: this.state.currentFile ? bytesForFile(this.state.currentFile) : this.state.currentSizeBytes,
      history: [...this.state.history],
      storageUsageBytes: scanDirectoryBytes(this.recordingsRoot),
      lastError: this.state.lastError,
    };
  }
}
