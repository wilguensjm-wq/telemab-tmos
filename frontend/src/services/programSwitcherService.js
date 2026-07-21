import { liveSourcesService } from "./liveSourcesService";

const ACTIONS = {
  PREVIEW: "preview",
  TAKE: "take",
  CUT: "cut",
  FADE: "fade",
  AUTO: "auto",
  EMERGENCY_BLACK: "emergency-black",
  EMERGENCY_SLATE: "emergency-slate",
  CLEAR_EMERGENCY: "clear-emergency",
};

function normalizeConnection(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("connected")) return "Connected";
  if (token.includes("degraded")) return "Degraded";
  if (token.includes("offline")) return "Offline";
  return "Unknown";
}

function normalizeSourceType(type) {
  const token = String(type || "").toLowerCase();
  if (token.includes("reporter")) return "Reporter";
  if (token.includes("studio")) return "Studio Camera";
  if (token.includes("guest")) return "Guest";
  if (token.includes("weather")) return "Weather Camera";
  return "Other";
}

function inferFrameRate(source) {
  if (source.frameRate) {
    return String(source.frameRate);
  }

  if (String(source.resolution || "").includes("3840x2160")) {
    return "59.94 fps";
  }

  return "29.97 fps";
}

function normalizeSources(sources) {
  return (Array.isArray(sources) ? sources : []).map((source) => ({
    ...source,
    type: normalizeSourceType(source.type),
    connectionStatus: normalizeConnection(source.connectionStatus),
    frameRate: inferFrameRate(source),
    activeTally: false,
  }));
}

function deriveDefaultProgram(sources) {
  const prioritized = [
    sources.find((source) => source.type === "Reporter" && source.connectionStatus === "Connected"),
    sources.find((source) => source.type === "Studio Camera" && source.connectionStatus === "Connected"),
    sources.find((source) => source.connectionStatus === "Connected"),
  ].filter(Boolean);

  return prioritized[0] || sources[0] || null;
}

function deriveDefaultPreview(sources, programSourceId) {
  return sources.find((source) => source.id !== programSourceId) || sources[0] || null;
}

function createEmergencySignal(mode) {
  if (mode === "black") {
    return {
      id: "emergency-black",
      name: "Emergency Black",
      type: "System",
      connectionStatus: "Connected",
      recordingStatus: "Not Recording",
      resolution: "1920x1080",
      frameRate: "59.94 fps",
      bitrateKbps: 0,
      latencyMs: 0,
      audioLevel: 0,
      previewLabel: "Emergency signal",
      location: "Control room",
      activeTally: true,
    };
  }

  return {
    id: "emergency-slate",
    name: "Emergency Slate",
    type: "System",
    connectionStatus: "Connected",
    recordingStatus: "Not Recording",
    resolution: "1920x1080",
    frameRate: "59.94 fps",
    bitrateKbps: 600,
    latencyMs: 0,
    audioLevel: 12,
    previewLabel: "Emergency signal",
    location: "Control room",
    activeTally: true,
  };
}

function toRuntimeSnapshot({ sources, programSourceId, previewSourceId, emergencyMode, liveState, recordingState, lastTransition }) {
  const activeProgramSource = emergencyMode
    ? createEmergencySignal(emergencyMode)
    : (sources.find((source) => source.id === programSourceId) || null);

  return {
    sources: sources.map((source) => ({
      ...source,
      activeTally: source.id === programSourceId && !emergencyMode,
    })),
    programSourceId,
    previewSourceId,
    emergencyMode,
    activeProgramSource,
    activePreviewSource: sources.find((source) => source.id === previewSourceId) || null,
    liveState,
    recordingState,
    lastTransition,
  };
}

function applyTransition(runtimeState, transitionName) {
  const nextProgramId = runtimeState.previewSourceId;
  if (!nextProgramId) {
    return runtimeState;
  }

  return toRuntimeSnapshot({
    ...runtimeState,
    programSourceId: nextProgramId,
    emergencyMode: null,
    liveState: "Live",
    recordingState: "Recording",
    lastTransition: transitionName,
  });
}

function createSwitcherState(source) {
  if (!source) {
    return {
      connectionStatus: "Awaiting source",
      recordingStatus: "Not Recording",
      resolution: "—",
      frameRate: "—",
      bitrateKbps: 0,
      latencyMs: null,
      audioLevel: 0,
    };
  }

  return {
    connectionStatus: source.connectionStatus,
    recordingStatus: source.recordingStatus,
    resolution: source.resolution,
    frameRate: source.frameRate,
    bitrateKbps: source.bitrateKbps,
    latencyMs: source.latencyMs,
    audioLevel: source.audioLevel,
  };
}

function createIntegrationContracts() {
  return {
    liveKit: {
      inputInterface: {
        sessionId: null,
        roomName: null,
        trackMappings: [],
        transport: "wss",
      },
      sourceAdapter: "pending",
    },
    outputs: {
      rtmp: {
        enabled: false,
        endpoint: null,
        streamKeyRef: null,
      },
      srt: {
        enabled: false,
        endpoint: null,
        mode: "caller",
        latencyMs: 120,
      },
    },
  };
}

export const programSwitcherService = {
  ACTIONS,

  async listSources() {
    const sources = await liveSourcesService.listSources();
    return normalizeSources(sources);
  },

  async getProgramSwitcherState() {
    const sources = normalizeSources(await liveSourcesService.listSources());
    const programSource = deriveDefaultProgram(sources);
    const previewSource = deriveDefaultPreview(sources, programSource?.id || null);
    const runtimeState = toRuntimeSnapshot({
      sources,
      programSourceId: programSource?.id || null,
      previewSourceId: previewSource?.id || null,
      emergencyMode: null,
      liveState: programSource ? "Live" : "Standby",
      recordingState: programSource ? "Recording" : "Standby",
      lastTransition: "Boot",
    });

    return {
      ...runtimeState,
      program: createSwitcherState(runtimeState.activeProgramSource),
      preview: createSwitcherState(runtimeState.activePreviewSource),
      sourceCount: sources.length,
      integrationContracts: createIntegrationContracts(),
    };
  },

  setPreviewSource(runtimeState, sourceId) {
    if (!runtimeState || !sourceId) {
      return runtimeState;
    }

    return toRuntimeSnapshot({
      ...runtimeState,
      previewSourceId: sourceId,
      lastTransition: "Preview",
    });
  },

  runAction(runtimeState, action) {
    if (!runtimeState || !action) {
      return runtimeState;
    }

    if (action === ACTIONS.PREVIEW) {
      return toRuntimeSnapshot({
        ...runtimeState,
        lastTransition: "Preview",
      });
    }

    if (action === ACTIONS.TAKE) {
      return applyTransition(runtimeState, "Take");
    }

    if (action === ACTIONS.CUT) {
      return applyTransition(runtimeState, "Cut");
    }

    if (action === ACTIONS.FADE) {
      return applyTransition(runtimeState, "Fade");
    }

    if (action === ACTIONS.AUTO) {
      return applyTransition(runtimeState, "Auto");
    }

    if (action === ACTIONS.EMERGENCY_BLACK) {
      return toRuntimeSnapshot({
        ...runtimeState,
        emergencyMode: "black",
        liveState: "Emergency",
        recordingState: "Recording",
        lastTransition: "Emergency Black",
      });
    }

    if (action === ACTIONS.EMERGENCY_SLATE) {
      return toRuntimeSnapshot({
        ...runtimeState,
        emergencyMode: "slate",
        liveState: "Emergency",
        recordingState: "Recording",
        lastTransition: "Emergency Slate",
      });
    }

    if (action === ACTIONS.CLEAR_EMERGENCY) {
      return toRuntimeSnapshot({
        ...runtimeState,
        emergencyMode: null,
        liveState: runtimeState.programSourceId ? "Live" : "Standby",
        recordingState: runtimeState.programSourceId ? "Recording" : "Standby",
        lastTransition: "Emergency Cleared",
      });
    }

    return runtimeState;
  },
};
