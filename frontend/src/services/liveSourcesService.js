import { liveKitService } from "./liveKitService";

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
  const recordingStatus = participant.cameraEnabled && connected
    ? "Live video"
    : connected
      ? "No incoming video"
      : "Offline";

  return {
    id: `livekit-${participant.participantId || participant.identity}`,
    name: participant.identity || "Participant",
    type,
    connectionStatus: participant.connectionStatus || normalizeQuality(participant.networkQuality),
    resolution: participant.trackResolution || "Unknown",
    bitrateKbps: null,
    latencyMs: null,
    audioLevel: Number(participant.audioLevel || 0),
    recordingStatus,
    previewLabel: participant.cameraEnabled ? "Live contribution" : "No incoming video",
    location: roomName ? `Room: ${roomName}` : "LiveKit room",
    providerHint: "LiveKit published stream",
    frameRate: null,
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
  return liveKitSources;
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
