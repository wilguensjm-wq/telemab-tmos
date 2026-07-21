import { Room, RoomEvent, createLocalAudioTrack, createLocalVideoTrack } from "livekit-client";
import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

const DEFAULT_ROOM_NAME = "tmos-live-sources";
const POLL_INTERVAL_MS = 3000;

function createEmitter() {
  const listeners = new Map();

  return {
    on(event, listener) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(listener);
      return () => {
        listeners.get(event)?.delete(listener);
      };
    },
    emit(event, payload) {
      const items = listeners.get(event);
      if (!items) {
        return;
      }
      for (const listener of items) {
        listener(payload);
      }
    },
  };
}

function safeIdentity(value) {
  return String(value || "").trim().replace(/\s+/g, "-").toLowerCase();
}

function parseResolution(dimensions) {
  if (!dimensions || !dimensions.width || !dimensions.height) {
    return null;
  }
  return `${dimensions.width}x${dimensions.height}`;
}

function normalizeConnection(state) {
  const token = String(state || "").toLowerCase();
  if (token.includes("connected")) return "Connected";
  if (token.includes("reconnecting")) return "Degraded";
  if (token.includes("disconnect")) return "Offline";
  return "Unknown";
}

function normalizeNetworkQuality(quality) {
  const value = Number(quality);
  if (!Number.isFinite(value)) return "Unknown";
  if (value >= 4) return "Excellent";
  if (value >= 3) return "Good";
  if (value >= 2) return "Fair";
  return "Poor";
}

function backendConnectionToStatus(status) {
  const token = String(status || "").toLowerCase();
  if (token.includes("connect") || token.includes("join") || token.includes("live")) {
    return "Connected";
  }
  if (token.includes("left") || token.includes("disconnect") || token.includes("offline")) {
    return "Offline";
  }
  return "Unknown";
}

class LiveKitService {
  constructor() {
    this.emitter = createEmitter();
    this.roomClient = null;
    this.roomContext = null;
    this.localTracks = {
      camera: null,
      microphone: null,
    };
    this.state = {
      roomName: DEFAULT_ROOM_NAME,
      roomId: null,
      participantId: null,
      participantIdentity: null,
      participantRole: null,
      connectionState: "disconnected",
      networkQuality: "Unknown",
      participants: [],
      isJoined: false,
      cameraEnabled: false,
      microphoneEnabled: false,
      wsConnected: false,
      lastError: "",
    };
    this.pollingTimer = null;
  }

  onParticipantEvents(listener) {
    return this.emitter.on("participants", listener);
  }

  onConnectionState(listener) {
    return this.emitter.on("connection", listener);
  }

  onNetworkQuality(listener) {
    return this.emitter.on("network", listener);
  }

  getSnapshot() {
    return {
      ...this.state,
      participants: [...this.state.participants],
    };
  }

  async listRooms() {
    const response = await APIClient.get(API_CONFIG.endpoints.media.rooms);
    const payload = response?.data?.data || [];
    return Array.isArray(payload) ? payload : [];
  }

  async ensureRoom(roomName) {
    const targetName = String(roomName || DEFAULT_ROOM_NAME).trim();
    const rooms = await this.listRooms();
    const existing = rooms.find((room) => String(room.name || "").toLowerCase() === targetName.toLowerCase());

    if (existing) {
      return existing;
    }

    const createResponse = await APIClient.post(API_CONFIG.endpoints.media.rooms, {
      providerKey: "livekit",
      roomName: targetName,
      roomType: "control-room",
      metadata: {
        module: "live-sources",
      },
    });

    return createResponse?.data?.data || createResponse?.data;
  }

  async joinRoom({ roomName, identity, role = "reporter", metadata = {} }) {
    try {
      const ensuredRoom = await this.ensureRoom(roomName);
      const safeName = safeIdentity(identity) || `participant-${Date.now()}`;

      const joinResponse = await APIClient.post(API_CONFIG.endpoints.media.joinSession, {
        roomId: ensuredRoom.id,
        participantIdentity: safeName,
        participantRole: role,
        metadata,
      });

      const payload = joinResponse?.data?.data || joinResponse?.data;
      const participant = payload?.participant || null;
      const connectionDetails = payload?.connectionDetails || {};

      this.roomContext = {
        roomId: ensuredRoom.id,
        roomName: ensuredRoom.name,
        participantId: participant?.id || null,
        participantIdentity: safeName,
        participantRole: role,
      };

      this.state = {
        ...this.state,
        roomId: ensuredRoom.id,
        roomName: ensuredRoom.name,
        participantId: participant?.id || null,
        participantIdentity: safeName,
        participantRole: role,
        isJoined: true,
        lastError: "",
      };

      await this.connectRoomClient(connectionDetails);
      await this.syncParticipants();
      this.startPolling();
      this.emitAll();
      return this.getSnapshot();
    } catch (error) {
      this.state = {
        ...this.state,
        isJoined: false,
        wsConnected: false,
        connectionState: "disconnected",
        lastError: formatApiError(error),
      };
      this.emitAll();
      throw new Error(formatApiError(error));
    }
  }

  async leaveRoom() {
    try {
      if (this.roomContext?.participantId) {
        await APIClient.post(`${API_CONFIG.endpoints.media.leaveSession}/${this.roomContext.participantId}/leave`, {});
      }
    } catch {
      // Preserve local cleanup path even if backend leave call fails.
    }

    this.stopPolling();
    this.disconnectRoomClient();

    this.roomContext = null;
    this.state = {
      ...this.state,
      roomId: null,
      participantId: null,
      participantIdentity: null,
      participantRole: null,
      participants: [],
      connectionState: "disconnected",
      networkQuality: "Unknown",
      isJoined: false,
      cameraEnabled: false,
      microphoneEnabled: false,
      wsConnected: false,
      lastError: "",
    };
    this.emitAll();
  }

  async publishCamera(enabled) {
    if (!this.roomClient || !this.state.wsConnected) {
      this.state = {
        ...this.state,
        cameraEnabled: Boolean(enabled),
      };
      this.emitAll();
      return this.getSnapshot();
    }

    if (enabled && !this.localTracks.camera) {
      const videoTrack = await createLocalVideoTrack();
      await this.roomClient.localParticipant.publishTrack(videoTrack);
      this.localTracks.camera = videoTrack;
    }

    if (!enabled && this.localTracks.camera) {
      await this.roomClient.localParticipant.unpublishTrack(this.localTracks.camera);
      this.localTracks.camera.stop();
      this.localTracks.camera = null;
    }

    this.state = {
      ...this.state,
      cameraEnabled: Boolean(enabled),
    };

    await this.persistParticipantMediaState();
    this.emitAll();
    return this.getSnapshot();
  }

  async publishMicrophone(enabled) {
    if (!this.roomClient || !this.state.wsConnected) {
      this.state = {
        ...this.state,
        microphoneEnabled: Boolean(enabled),
      };
      this.emitAll();
      return this.getSnapshot();
    }

    if (enabled && !this.localTracks.microphone) {
      const audioTrack = await createLocalAudioTrack();
      await this.roomClient.localParticipant.publishTrack(audioTrack);
      this.localTracks.microphone = audioTrack;
    }

    if (!enabled && this.localTracks.microphone) {
      await this.roomClient.localParticipant.unpublishTrack(this.localTracks.microphone);
      this.localTracks.microphone.stop();
      this.localTracks.microphone = null;
    }

    this.state = {
      ...this.state,
      microphoneEnabled: Boolean(enabled),
    };

    await this.persistParticipantMediaState();
    this.emitAll();
    return this.getSnapshot();
  }

  subscribeToRemoteTracks(listener) {
    return this.emitter.on("tracks", listener);
  }

  async refreshParticipants() {
    await this.syncParticipants();
    this.emitAll();
    return this.getSnapshot();
  }

  async connectRoomClient(connectionDetails = {}) {
    this.disconnectRoomClient();

    const wsUrl = String(connectionDetails.wsUrl || "").trim();
    const token = String(connectionDetails.token || "").trim();

    if (!wsUrl || !token) {
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "disconnected",
      };
      return;
    }

    this.roomClient = new Room({ adaptiveStream: true, dynacast: true });
    this.bindRoomEvents();

    try {
      await this.roomClient.connect(wsUrl, token);
      this.state = {
        ...this.state,
        wsConnected: true,
        connectionState: normalizeConnection(this.roomClient.state),
      };
    } catch {
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "disconnected",
      };
    }
  }

  disconnectRoomClient() {
    if (this.localTracks.camera) {
      this.localTracks.camera.stop();
      this.localTracks.camera = null;
    }

    if (this.localTracks.microphone) {
      this.localTracks.microphone.stop();
      this.localTracks.microphone = null;
    }

    if (this.roomClient) {
      this.roomClient.disconnect();
      this.roomClient = null;
    }
  }

  bindRoomEvents() {
    if (!this.roomClient) {
      return;
    }

    this.roomClient.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.state = {
        ...this.state,
        connectionState: normalizeConnection(state),
        wsConnected: String(state || "").toLowerCase().includes("connected"),
      };
      this.emitAll();
    });

    this.roomClient.on(RoomEvent.ParticipantConnected, () => {
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.ParticipantDisconnected, () => {
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
      this.emitter.emit("tracks", {
        publication,
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      this.emitter.emit("tracks", {
        publication,
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.ActiveSpeakersChanged, () => {
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.LocalTrackPublished, () => {
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.LocalTrackUnpublished, () => {
      this.syncParticipants().then(() => this.emitAll());
    });
  }

  async persistParticipantMediaState() {
    if (!this.roomContext?.participantId) {
      return;
    }

    try {
      await APIClient.post(`${API_CONFIG.endpoints.media.participantDevices}/${this.roomContext.participantId}/devices`, {
        deviceSelection: {
          cameraEnabled: this.state.cameraEnabled,
          microphoneEnabled: this.state.microphoneEnabled,
        },
      });
      await APIClient.post(`${API_CONFIG.endpoints.media.participantPublisher}/${this.roomContext.participantId}/publisher`, {
        enabled: Boolean(this.state.cameraEnabled || this.state.microphoneEnabled),
      });
    } catch {
      // Keep local UX responsive even if backend media metadata persistence fails.
    }
  }

  extractLiveKitParticipant(participant, isLocal = false) {
    const videoPublication = Array.from(participant.videoTrackPublications.values())[0] || null;
    const audioPublication = Array.from(participant.audioTrackPublications.values())[0] || null;

    return {
      key: participant.sid || participant.identity,
      participantId: participant.sid || participant.identity,
      identity: participant.identity,
      role: isLocal ? this.state.participantRole || "reporter" : "remote",
      connectionStatus: "Connected",
      cameraEnabled: Boolean(videoPublication && !videoPublication.isMuted),
      microphoneEnabled: Boolean(audioPublication && !audioPublication.isMuted),
      speaking: Boolean(participant.isSpeaking),
      audioLevel: Math.round(Math.max(0, Math.min(1, participant.audioLevel || 0)) * 100),
      networkQuality: normalizeNetworkQuality(participant.networkQuality),
      trackResolution: parseResolution(videoPublication?.videoTrack?.dimensions) || "Unknown",
      trackSid: videoPublication?.trackSid || null,
      source: "livekit",
    };
  }

  mapBackendParticipant(participant) {
    const derivedIdentity = participant?.metadata?.participantIdentity
      || participant?.metadata?.identity
      || `${participant.participantRole || "participant"}-${String(participant.id || "unknown").slice(0, 8)}`;

    const cameraEnabled = Boolean(participant?.deviceSelection?.cameraEnabled);
    const microphoneEnabled = Boolean(participant?.deviceSelection?.microphoneEnabled);

    return {
      key: participant.id,
      participantId: participant.id,
      identity: derivedIdentity,
      role: participant.participantRole || "reporter",
      connectionStatus: participant.leftAt ? "Offline" : backendConnectionToStatus(participant.connectionStatus),
      cameraEnabled,
      microphoneEnabled,
      speaking: false,
      audioLevel: 0,
      networkQuality: "Unknown",
      trackResolution: participant.metadata?.trackResolution || "Unknown",
      trackSid: null,
      source: "backend",
    };
  }

  async syncParticipants() {
    const backendParticipants = [];

    if (this.roomContext?.roomId || this.state.roomName) {
      try {
        const rooms = await this.listRooms();
        let room = null;

        if (this.roomContext?.roomId) {
          room = rooms.find((item) => item.id === this.roomContext.roomId) || null;
        }

        if (!room && this.state.roomName) {
          room = rooms.find((item) => String(item.name || "").toLowerCase() === String(this.state.roomName || "").toLowerCase()) || null;
        }

        if (room?.id && !this.state.roomId) {
          this.state = {
            ...this.state,
            roomId: room.id,
          };
        }

        const entries = Array.isArray(room?.participants) ? room.participants : [];
        backendParticipants.push(...entries.map((entry) => this.mapBackendParticipant(entry)));
      } catch {
        // Keep existing participants if room list cannot be refreshed.
      }
    }

    const liveKitParticipants = [];
    if (this.roomClient && this.state.wsConnected) {
      liveKitParticipants.push(this.extractLiveKitParticipant(this.roomClient.localParticipant, true));
      for (const participant of this.roomClient.remoteParticipants.values()) {
        liveKitParticipants.push(this.extractLiveKitParticipant(participant, false));
      }
    }

    const merged = new Map();

    for (const participant of backendParticipants) {
      merged.set(participant.identity, participant);
    }

    for (const participant of liveKitParticipants) {
      const existing = merged.get(participant.identity);
      merged.set(participant.identity, {
        ...(existing || {}),
        ...participant,
      });
    }

    const participants = Array.from(merged.values());
    const localParticipant = participants.find((item) => item.identity === this.state.participantIdentity) || null;

    this.state = {
      ...this.state,
      participants,
      cameraEnabled: localParticipant?.cameraEnabled || false,
      microphoneEnabled: localParticipant?.microphoneEnabled || false,
      networkQuality: localParticipant?.networkQuality || "Unknown",
    };
  }

  startPolling() {
    this.stopPolling();
    this.pollingTimer = setInterval(() => {
      this.syncParticipants().then(() => this.emitAll());
    }, POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  emitAll() {
    this.emitter.emit("participants", this.getSnapshot());
    this.emitter.emit("connection", this.state.connectionState);
    this.emitter.emit("network", this.state.networkQuality);
  }
}

export const liveKitService = new LiveKitService();
