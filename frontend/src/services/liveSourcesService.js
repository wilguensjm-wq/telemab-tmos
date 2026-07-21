import { liveKitService } from "./liveKitService";

const BASE_SOURCES = [
  {
    id: "source-studio-cam-1",
    name: "Studio Camera 2",
    type: "Studio Camera",
    connectionStatus: "Connected",
    resolution: "3840x2160",
    bitrateKbps: 12800,
    latencyMs: 24,
    audioLevel: 58,
    recordingStatus: "Standby",
    previewLabel: "Preview feed",
    location: "Main studio floor",
    providerHint: "Primary studio source",
  },
  {
    id: "source-guest-1",
    name: "Guest Remote Feed",
    type: "Guest",
    connectionStatus: "Degraded",
    resolution: "1280x720",
    bitrateKbps: 2400,
    latencyMs: 92,
    audioLevel: 44,
    recordingStatus: "Not Recording",
    previewLabel: "Remote guest preview",
    location: "Remote contributor",
    providerHint: "Remote ingest source",
  },
  {
    id: "source-weather-1",
    name: "Weather Camera North",
    type: "Weather Camera",
    connectionStatus: "Connected",
    resolution: "1920x1080",
    bitrateKbps: 4800,
    latencyMs: 41,
    audioLevel: 31,
    recordingStatus: "Not Recording",
    previewLabel: "Weather cam preview",
    location: "North rooftop",
    providerHint: "Auxiliary weather source",
  },
  {
    id: "source-guest-2",
    name: "Remote Guest B",
    type: "Guest",
    connectionStatus: "Offline",
    resolution: "N/A",
    bitrateKbps: 0,
    latencyMs: null,
    audioLevel: 0,
    recordingStatus: "Not Available",
    previewLabel: "No preview available",
    location: "Awaiting connection",
    providerHint: "Backup remote source",
  },
];

const listeners = new Set();

let liveKitSnapshot = liveKitService.getSnapshot();

function normalizeQuality(quality) {
  const token = String(quality || "").toLowerCase();
  if (token.includes("excellent") || token.includes("good")) {
    return "Connected";
  }
  if (token.includes("fair")) {
    return "Degraded";
  }
  if (token.includes("poor")) {
    return "Offline";
  }
  return "Unknown";
}

function mapParticipantToSource(participant, roomName) {
  const type = "Reporter";

  const connected = participant.connectionStatus === "Connected";
  const recordingStatus = participant.cameraEnabled
    ? "Recording"
    : connected
      ? "Standby"
      : "Not Recording";

  return {
    id: `livekit-${participant.participantId || participant.identity}`,
    name: participant.identity || "LiveKit Participant",
    type,
    connectionStatus: participant.connectionStatus || normalizeQuality(participant.networkQuality),
    resolution: participant.trackResolution || "Unknown",
    bitrateKbps: connected ? 5400 : 0,
    latencyMs: connected ? 45 : null,
    audioLevel: Number(participant.audioLevel || 0),
    recordingStatus,
    previewLabel: "LiveKit participant",
    location: roomName ? `Room: ${roomName}` : "LiveKit room",
    providerHint: "LiveKit participant media",
    frameRate: "29.97 fps",
    cameraStatus: participant.cameraEnabled ? "On" : "Off",
    microphoneStatus: participant.microphoneEnabled ? "On" : "Off",
    networkQuality: participant.networkQuality || "Unknown",
    speaking: Boolean(participant.speaking),
    trackResolution: participant.trackResolution || "Unknown",
    participantRole: participant.role || "reporter",
    sourceProvider: "livekit",
  };
}

function cloneSource(source) {
  return {
    ...source,
    bitrate: source.bitrateKbps,
    latency: source.latencyMs,
    cameraStatus: source.cameraStatus || "N/A",
    microphoneStatus: source.microphoneStatus || "N/A",
    networkQuality: source.networkQuality || "Unknown",
    speaking: Boolean(source.speaking),
    trackResolution: source.trackResolution || source.resolution || "Unknown",
    sourceProvider: source.sourceProvider || "inventory",
  };
}

function buildMergedSources() {
  const liveKitSources = (liveKitSnapshot.participants || []).map((participant) => (
    cloneSource(mapParticipantToSource(participant, liveKitSnapshot.roomName))
  ));

  const base = BASE_SOURCES.map(cloneSource);
  return [...liveKitSources, ...base];
}

function emitUpdate() {
  const payload = {
    sources: buildMergedSources(),
    liveKit: liveKitSnapshot,
  };

  for (const listener of listeners) {
    listener(payload);
  }
}

liveKitService.onParticipantEvents((snapshot) => {
  liveKitSnapshot = snapshot;
  emitUpdate();
});

liveKitService.onConnectionState(() => {
  liveKitSnapshot = liveKitService.getSnapshot();
  emitUpdate();
});

liveKitService.onNetworkQuality(() => {
  liveKitSnapshot = liveKitService.getSnapshot();
  emitUpdate();
});

export const liveSourcesService = {
  async listSources() {
    await liveKitService.refreshParticipants();
    liveKitSnapshot = liveKitService.getSnapshot();
    return buildMergedSources();
  },

  getLiveKitState() {
    return liveKitService.getSnapshot();
  },

  subscribe(listener) {
    listeners.add(listener);
    listener({
      sources: buildMergedSources(),
      liveKit: liveKitService.getSnapshot(),
    });

    return () => {
      listeners.delete(listener);
    };
  },

  async joinLiveKitRoom(payload) {
    await liveKitService.joinRoom(payload);
    liveKitSnapshot = liveKitService.getSnapshot();
    emitUpdate();
    return liveKitSnapshot;
  },

  async leaveLiveKitRoom() {
    await liveKitService.leaveRoom();
    liveKitSnapshot = liveKitService.getSnapshot();
    emitUpdate();
    return liveKitSnapshot;
  },

  async publishCamera(enabled) {
    await liveKitService.publishCamera(enabled);
    liveKitSnapshot = liveKitService.getSnapshot();
    emitUpdate();
    return liveKitSnapshot;
  },

  async publishMicrophone(enabled) {
    await liveKitService.publishMicrophone(enabled);
    liveKitSnapshot = liveKitService.getSnapshot();
    emitUpdate();
    return liveKitSnapshot;
  },

  async refreshParticipants() {
    await liveKitService.refreshParticipants();
    liveKitSnapshot = liveKitService.getSnapshot();
    emitUpdate();
    return liveKitSnapshot;
  },
};
