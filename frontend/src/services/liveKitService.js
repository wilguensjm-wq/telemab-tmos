import { Room, RoomEvent, createLocalAudioTrack, createLocalVideoTrack } from "livekit-client";
import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";

const DEFAULT_ROOM_NAME = "tmos-live-sources";
const POLL_INTERVAL_MS = 3000;

// Helper function to check for available media devices
async function checkMediaDevices(kind = 'videoinput') {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Media device enumeration is not supported in this browser.");
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const availableDevices = devices.filter(d => d.kind === kind);
    return availableDevices;
  } catch (error) {
    throw new Error(`Cannot access media devices: ${error.message}`);
  }
}

// Helper function to check browser permissions
async function checkBrowserPermissions(kind = 'camera') {
  try {
    // Check if browser supports Permissions API
    if (!navigator.permissions || !navigator.permissions.query) {
      return null;
    }
    
    const permissionName = kind === 'camera' ? 'camera' : 'microphone';
    const permission = await navigator.permissions.query({ name: permissionName });
    return permission.state;
  } catch (error) {
    return null;
  }
}

function mapMicrophoneError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();

  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission")) {
    return "Microphone unavailable. Allow microphone access for this site in your browser settings, then try again.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Microphone unavailable. No microphone was detected. Check that your microphone is connected and try again.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Microphone unavailable. Another application may be using your microphone. Close other apps and try again.";
  }

  if (name === "OverconstrainedError") {
    return "Microphone unavailable. The selected microphone could not be activated. Reconnect the device and try again.";
  }

  return "Microphone unavailable. Check that your microphone is connected, grant browser microphone permission, or close any app using it, then try again.";
}

function mapPermissionPreflightError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();

  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission")) {
    return "Permission denied. Allow camera and microphone access in your browser settings, then try again.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera or microphone device was detected. Connect your devices and try again.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera or microphone is currently busy in another application. Close other apps and try again.";
  }

  return error?.message || "Unable to verify camera and microphone permissions.";
}

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
  if (token.includes("connecting")) return "Connecting";
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

function buildRequestUrl(baseURL, url) {
  const prefix = String(baseURL || "").replace(/\/$/, "");
  const suffix = String(url || "").startsWith("/") ? String(url || "") : `/${String(url || "")}`;
  return `${prefix}${suffix}`;
}

async function traceAwait(label, operation, logger, warnAfterMs = 8000) {
  logger(`${label}:start`);
  const pendingTimer = setTimeout(() => {
    logger(`${label}:pending`, { elapsedMs: warnAfterMs });
  }, warnAfterMs);

  try {
    const result = await operation();
    clearTimeout(pendingTimer);
    logger(`${label}:success`);
    return result;
  } catch (error) {
    clearTimeout(pendingTimer);
    logger(`${label}:error`, {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw error;
  }
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

  log(step, details = {}) {
    console.info("[LiveKitService]", step, details);
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

  getLocalCameraTrack() {
    return this.localTracks.camera || null;
  }

  getVideoTrackForParticipant(identity) {
    const participantIdentity = String(identity || "").trim();
    if (!participantIdentity || !this.roomClient || !this.state.wsConnected) {
      return null;
    }

    if (participantIdentity === this.state.participantIdentity) {
      if (this.localTracks.camera) {
        return this.localTracks.camera;
      }

      const localPublication = Array.from(this.roomClient.localParticipant.videoTrackPublications.values())
        .find((publication) => publication?.track) || null;
      return localPublication?.videoTrack || localPublication?.track || null;
    }

    const remoteParticipant = Array.from(this.roomClient.remoteParticipants.values())
      .find((participant) => participant.identity === participantIdentity) || null;

    if (!remoteParticipant) {
      return null;
    }

    const remotePublication = Array.from(remoteParticipant.videoTrackPublications.values())
      .find((publication) => publication?.track && !publication.isMuted)
      || Array.from(remoteParticipant.videoTrackPublications.values()).find((publication) => publication?.track)
      || null;

    return remotePublication?.videoTrack || remotePublication?.track || null;
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
      const tokenRequestUrl = buildRequestUrl(API_CONFIG.baseURL, API_CONFIG.endpoints.media.joinSession);
      this.log("join:start", {
        roomName,
        identity,
        role,
        tokenRequestUrl,
      });
      this.state = {
        ...this.state,
        connectionState: "Connecting",
        wsConnected: false,
        lastError: "",
      };
      this.emitAll();

      const ensuredRoom = await this.ensureRoom(roomName);
      const safeName = safeIdentity(identity) || `participant-${Date.now()}`;
      this.log("join:room-ensured", { roomId: ensuredRoom?.id || null, roomName: ensuredRoom?.name || null });

      let joinResponse;
      try {
        this.log("join:token-request:send", {
          tokenRequestUrl,
          roomId: ensuredRoom.id,
          participantIdentity: safeName,
        });
        joinResponse = await traceAwait(
          "join:token-request",
          () => APIClient.post(API_CONFIG.endpoints.media.joinSession, {
            roomId: ensuredRoom.id,
            participantIdentity: safeName,
            participantRole: role,
            metadata,
          }),
          this.log.bind(this),
        );
      } catch (error) {
        this.log("join:token-error", {
          tokenRequestUrl,
          status: error?.response?.status ?? null,
          body: error?.response?.data ?? null,
          message: error?.message || String(error),
          stack: error?.stack || null,
        });
        throw error;
      }

      this.log("join:token-response", {
        participantIdentity: safeName,
        roomId: ensuredRoom?.id || null,
        status: joinResponse?.status ?? null,
        body: joinResponse?.data ?? null,
        liveKitUrl: joinResponse?.data?.data?.connectionDetails?.wsUrl || joinResponse?.data?.connectionDetails?.wsUrl || null,
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
        isJoined: false,
        connectionState: "Connecting",
        wsConnected: false,
        lastError: "",
      };

      this.emitAll();

      await traceAwait(
        "join:connect-room-client",
        () => this.connectRoomClient(connectionDetails),
        this.log.bind(this),
      );
      this.state = {
        ...this.state,
        isJoined: true,
      };
      await this.syncParticipants();
      this.startPolling();
      this.emitAll();
      return this.getSnapshot();
    } catch (error) {
      this.state = {
        ...this.state,
        isJoined: false,
        wsConnected: false,
        connectionState: "Error",
        lastError: error?.message || String(error),
      };
      this.log("join:error", {
        message: error?.message || String(error),
        stack: error?.stack || null,
        status: error?.response?.status ?? null,
        body: error?.response?.data ?? null,
      });
      this.emitAll();
      throw error instanceof Error ? error : new Error(error?.message || String(error));
    }
  }

  async preflightMediaPermissions() {
    try {
      this.log("permissions:start");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media capture is not supported in this browser.");
      }

      const [cameraPermission, microphonePermission] = await Promise.all([
        checkBrowserPermissions("camera"),
        checkBrowserPermissions("microphone"),
      ]);
      this.log("permissions:browser-state", { cameraPermission, microphonePermission });

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      this.log("permissions:getUserMedia-success");

      const [cameraDevices, microphoneDevices] = await Promise.all([
        checkMediaDevices("videoinput"),
        checkMediaDevices("audioinput"),
      ]);

      this.log("permissions:devices-detected", {
        cameraDevices: cameraDevices.length,
        microphoneDevices: microphoneDevices.length,
      });

      this.state = {
        ...this.state,
        lastError: "",
      };
      this.emitAll();
      this.log("permissions:granted");

      return {
        cameraGranted: true,
        microphoneGranted: true,
        message: "Camera and microphone access granted.",
      };
    } catch (error) {
      const message = mapPermissionPreflightError(error);
      this.log("permissions:error", { message });
      this.state = {
        ...this.state,
        lastError: message,
      };
      this.emitAll();
      throw new Error(message);
    }
  }

  async leaveRoom() {
    try {
      this.log("leave:start");
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
    this.log("leave:complete");
  }

  async publishCamera(enabled) {
    this.log("publishCamera:invoke", { enabled });
    if (!this.roomClient || !this.state.wsConnected) {
      this.state = {
        ...this.state,
        cameraEnabled: false,
        lastError: 'Connect to the broadcast room before enabling camera.',
      };
      this.emitAll();
      throw new Error('Connect to the broadcast room before enabling camera.');
    }

    if (enabled && !this.localTracks.camera) {
      try {
        this.log("camera:start", { enabled });
        try {
          const cameraDevices = await checkMediaDevices('videoinput');
          this.log("camera:devices-detected", { cameraDevices: cameraDevices.length });
        } catch (deviceError) {
          // Device enumeration is inconsistent on some mobile browsers; try opening a track anyway.
          this.log("camera:devices-enumeration-warning", {
            message: deviceError?.message || String(deviceError),
          });
        }

        const permissionState = await checkBrowserPermissions('camera');
        if (permissionState === 'denied') {
          throw new Error('Camera permission denied. Please allow camera access in browser settings and reload the page.');
        }
        const videoTrack = await traceAwait(
          "camera:create-local-video-track",
          () => createLocalVideoTrack(),
          this.log.bind(this),
        );
        this.log("camera:publishTrack:attempt", { trackKind: videoTrack?.kind || null });
        await traceAwait(
          "camera:publish-track",
          () => this.roomClient.localParticipant.publishTrack(videoTrack),
          this.log.bind(this),
        );
        this.log("camera:publishTrack:success", { trackSid: videoTrack?.sid || null });

        this.localTracks.camera = videoTrack;

        // Update UI state only after successful publish.
        this.state = {
          ...this.state,
          cameraEnabled: true,
        };
        await this.persistParticipantMediaState();
        this.emitAll();
        this.log("camera:enabled");
        return this.getSnapshot();
      } catch (error) {
        // ===== KEEP UI IN FALSE STATE ON FAILURE =====
        this.log("camera:publishTrack:error", {
          message: error?.message || String(error),
          stack: error?.stack || null,
        });
        this.state = {
          ...this.state,
          cameraEnabled: false,
          lastError: `Camera error: ${error.message}`,
        };
        this.emitAll();
        throw error;
      }
    }

    if (!enabled && this.localTracks.camera) {
      try {
        this.log("camera:disable:start");
        await this.roomClient.localParticipant.unpublishTrack(this.localTracks.camera);
        this.localTracks.camera.stop();
        this.localTracks.camera = null;
      } catch (error) {
        this.localTracks.camera = null;
      }
      
      // ===== UPDATE UI AFTER SUCCESSFUL DISABLE =====
      this.state = {
        ...this.state,
        cameraEnabled: false,
      };
      await this.persistParticipantMediaState();
      this.emitAll();
      this.log("camera:disabled");
      return this.getSnapshot();
    }

    // ===== ALREADY ENABLED OR NO-OP - RETURN CURRENT STATE =====
    return this.getSnapshot();
  }

  async publishMicrophone(enabled) {
    this.log("publishMicrophone:invoke", { enabled });
    if (!this.roomClient || !this.state.wsConnected) {
      this.state = {
        ...this.state,
        microphoneEnabled: false,
        lastError: 'Connect to the broadcast room before enabling microphone.',
      };
      this.emitAll();
      throw new Error('Connect to the broadcast room before enabling microphone.');
    }

    if (enabled && !this.localTracks.microphone) {
      try {
        this.log("microphone:start", { enabled });
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone capture is not supported in this browser.");
        }

        const permissionState = await checkBrowserPermissions('microphone');
        if (permissionState === 'denied') {
          throw new Error('Microphone permission denied. Please allow microphone access in browser settings.');
        }

        let micDevices = [];
        try {
          micDevices = await checkMediaDevices('audioinput');
          if (!micDevices.length) {
            // Some browsers only expose audio inputs after a successful permissioned media request.
            const warmupStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            warmupStream.getTracks().forEach((track) => track.stop());
            micDevices = await checkMediaDevices('audioinput');
          }
        } catch (deviceError) {
          this.log("microphone:devices-enumeration-warning", {
            message: deviceError?.message || String(deviceError),
          });
        }

        this.log("microphone:devices-detected", { microphoneDevices: micDevices.length });

        const preferredDevice = micDevices.find((device) => device.deviceId && device.deviceId !== 'default')
          || micDevices[0]
          || null;
        const audioTrack = preferredDevice?.deviceId
          ? await createLocalAudioTrack({ deviceId: { exact: preferredDevice.deviceId } })
          : await createLocalAudioTrack();
        this.log("microphone:publishTrack:attempt", { trackKind: audioTrack?.kind || null });
        await traceAwait(
          "microphone:publish-track",
          () => this.roomClient.localParticipant.publishTrack(audioTrack),
          this.log.bind(this),
        );
        this.log("microphone:publishTrack:success", { trackSid: audioTrack?.sid || null });
        
        this.localTracks.microphone = audioTrack;
        
        // ===== ONLY UPDATE UI AFTER SUCCESSFUL PUBLISH =====
        this.state = {
          ...this.state,
          microphoneEnabled: true,
        };
        await this.persistParticipantMediaState();
        this.emitAll();
        this.log("microphone:enabled");
        return this.getSnapshot();
      } catch (error) {
        const userFriendlyError = mapMicrophoneError(error);
        // ===== KEEP UI IN FALSE STATE ON FAILURE =====
        this.log("microphone:publishTrack:error", {
          message: error?.message || String(error),
          stack: error?.stack || null,
        });
        this.state = {
          ...this.state,
          microphoneEnabled: false,
          lastError: userFriendlyError,
        };
        this.emitAll();
        throw new Error(userFriendlyError);
      }
    }

    if (!enabled && this.localTracks.microphone) {
      try {
        this.log("microphone:disable:start");
        await this.roomClient.localParticipant.unpublishTrack(this.localTracks.microphone);
        this.localTracks.microphone.stop();
        this.localTracks.microphone = null;
      } catch (error) {
        this.localTracks.microphone = null;
      }
      
      // ===== UPDATE UI AFTER SUCCESSFUL DISABLE =====
      this.state = {
        ...this.state,
        microphoneEnabled: false,
      };
      await this.persistParticipantMediaState();
      this.emitAll();
      this.log("microphone:disabled");
      return this.getSnapshot();
    }

    // ===== ALREADY ENABLED OR NO-OP - RETURN CURRENT STATE =====
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
    this.log("connect:start", { liveKitUrl: wsUrl, hasToken: Boolean(token) });

    if (!wsUrl || !token) {
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "disconnected",
        lastError: "Missing LiveKit connection details.",
      };
      this.log("connect:missing-details", { liveKitUrl: wsUrl, hasToken: Boolean(token) });
      throw new Error("Missing LiveKit connection details.");
    }

    this.roomClient = new Room({ adaptiveStream: true, dynacast: true });
    this.bindRoomEvents();

    try {
      this.state = {
        ...this.state,
        connectionState: "Connecting",
        wsConnected: false,
      };
      this.emitAll();
      this.log("connect:attempt", { wsUrl });
      await traceAwait(
        "connect:room-connect",
        () => this.roomClient.connect(wsUrl, token),
        this.log.bind(this),
      );
      this.state = {
        ...this.state,
        wsConnected: true,
        connectionState: normalizeConnection(this.roomClient.state),
      };
      this.log("connect:success", { connectionState: this.state.connectionState });
    } catch (error) {
      this.log("connect:error", {
        message: error?.message || String(error),
        stack: error?.stack || null,
        liveKitUrl: wsUrl,
      });
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "Error",
        lastError: error?.message || String(error),
      };
      throw error;
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
      const normalizedState = normalizeConnection(state);
      this.log("state:connection", { raw: state, normalizedState });
      this.state = {
        ...this.state,
        connectionState: normalizedState,
        wsConnected: normalizedState === "Connected",
      };
      this.emitAll();
    });

    this.roomClient.on(RoomEvent.Disconnected, (...args) => {
      this.log("state:disconnected", {
        args,
        stack: args.find((item) => item instanceof Error)?.stack || null,
      });
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "Offline",
        lastError: args.find((item) => item instanceof Error)?.message || this.state.lastError || "",
      };
      this.emitAll();
    });

    this.roomClient.on(RoomEvent.ParticipantConnected, (participant) => {
      this.log("event:participant-connected", { identity: participant?.identity || null, sid: participant?.sid || null });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.log("event:participant-disconnected", { identity: participant?.identity || null, sid: participant?.sid || null });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
      this.log("event:track-subscribed", {
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.emitter.emit("tracks", {
        publication,
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      this.log("event:track-unsubscribed", {
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.emitter.emit("tracks", {
        publication,
        participantIdentity: participant?.identity || "unknown",
        trackSid: publication?.trackSid || null,
      });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.log("event:active-speakers", { speakers: speakers?.map((speaker) => speaker?.identity || speaker?.sid || null) || [] });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.LocalTrackPublished, (publication) => {
      this.log("event:local-track-published", { trackSid: publication?.trackSid || null, kind: publication?.kind || null });
      this.syncParticipants().then(() => this.emitAll());
    });

    this.roomClient.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      this.log("event:local-track-unpublished", { trackSid: publication?.trackSid || null, kind: publication?.kind || null });
      this.syncParticipants().then(() => this.emitAll());
    });

    // Add error event listener
    this.roomClient.on(RoomEvent.RoomFinished, () => {
      this.log("event:room-finished");
      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "Offline",
      };
      this.emitAll();
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
