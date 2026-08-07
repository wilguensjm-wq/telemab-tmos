import { Room, RoomEvent, createLocalAudioTrack, createLocalVideoTrack } from "livekit-client";
import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { clearStoredAuth, getAccessToken, getRefreshToken, setStoredAuth } from "../utils/storage";

const DEFAULT_ROOM_NAME = "tmos-live-sources";
const POLL_INTERVAL_MS = 3000;
const ROOM_ACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;

const ROOM_CACHE_PREFIX = "tmos.livekit.roomId:";
const CAMERA_PROFILES = Object.freeze({
  sd: { width: 1280, height: 720, frameRate: 24 },
  hd: { width: 1920, height: 1080, frameRate: 30 },
  uhd: { width: 3840, height: 2160, frameRate: 30 },
});

function normalizeCameraProfile(value) {
  const token = String(value || "").trim().toLowerCase();
  if (token === "sd" || token === "uhd") {
    return token;
  }
  return "hd";
}

function parseParticipantMetadata(participant) {
  const raw = participant?.metadata;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function isProducerIdentity(participant) {
  const metadata = parseParticipantMetadata(participant);
  const role = String(metadata?.role || metadata?.participantRole || "").trim().toLowerCase();
  const type = String(metadata?.type || "").trim().toLowerCase();
  const identity = String(participant?.identity || "").trim().toLowerCase();
  return role === "producer" || type.includes("monitor") || identity.startsWith("producer-");
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isParticipantRecent(participant, now = Date.now()) {
  const joinedAt = parseTimestamp(participant?.joinedAt);
  const updatedAt = parseTimestamp(participant?.updatedAt);
  const candidate = Math.max(joinedAt, updatedAt);
  if (!candidate) return false;
  return (now - candidate) <= ROOM_ACTIVITY_WINDOW_MS;
}

function getActiveParticipants(room = {}) {
  const now = Date.now();
  const participants = (Array.isArray(room?.participants) ? room.participants : []).filter(
    (participant) => !participant?.leftAt && String(participant?.connectionStatus || "").toLowerCase() !== "left",
  );
  const recent = participants.filter((participant) => isParticipantRecent(participant, now));
  return recent.length > 0 ? recent : participants;
}

function countActiveParticipants(room = {}) {
  return getActiveParticipants(room).length;
}

function countActiveProducers(room = {}) {
  return getActiveParticipants(room).filter((participant) => String(participant?.participantRole || "").toLowerCase() === "producer").length;
}

function getLatestProducerJoinedAt(room = {}) {
  return getActiveParticipants(room)
    .filter((participant) => String(participant?.participantRole || "").toLowerCase() === "producer")
    .reduce((latest, participant) => Math.max(latest, parseTimestamp(participant?.joinedAt)), 0);
}

function resolvePreferredRoomByName(rooms = [], roomName = "") {
  const target = String(roomName || "").trim().toLowerCase();
  const candidates = (Array.isArray(rooms) ? rooms : []).filter((room) => {
    const candidateName = String(room?.name || room?.roomName || "").trim().toLowerCase();
    return candidateName === target;
  });

  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((a, b) => {
    const producerDelta = countActiveProducers(b) - countActiveProducers(a);
    if (producerDelta !== 0) {
      return producerDelta;
    }

    const latestProducerDelta = getLatestProducerJoinedAt(b) - getLatestProducerJoinedAt(a);
    if (latestProducerDelta !== 0) {
      return latestProducerDelta;
    }

    const activeDelta = countActiveParticipants(b) - countActiveParticipants(a);
    if (activeDelta !== 0) {
      return activeDelta;
    }

    const timeA = Date.parse(a?.createdAt || a?.updatedAt || "") || 0;
    const timeB = Date.parse(b?.createdAt || b?.updatedAt || "") || 0;
    return timeB - timeA;
  })[0] || null;
}
function getTokenExpiryIso(accessToken) {
  try {
    const token = String(accessToken || "").trim();
    if (!token.includes(".")) return null;
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    const exp = Number(payload?.exp || 0);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return new Date(exp * 1000).toISOString();
  } catch {
    return null;
  }
}

function getApiErrorMessage(error) {
  return String(
    error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || "",
  ).trim();
}

function isAuthTokenExpiredError(error) {
  const status = Number(error?.response?.status || 0);
  const message = getApiErrorMessage(error).toLowerCase();
  const tokenExpiredMessage = message.includes("invalid or expired access token")
    || message.includes("expired access token")
    || message.includes("token expired");

  if (status === 401) return true;
  if (status === 403 && tokenExpiredMessage) return true;
  return tokenExpiredMessage;
}

async function refreshAccessSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("Missing refresh token.");
  }

  const response = await APIClient.post(API_CONFIG.endpoints.auth.refresh, { refreshToken });
  const payload = response?.data?.data || response?.data;
  if (!payload?.accessToken) {
    throw new Error("Auth refresh did not return a valid access token.");
  }

  setStoredAuth(payload.accessToken, payload.refreshToken || refreshToken, payload.user || null);
  return payload.accessToken;
}

function serializeMediaDevice(device = {}) {
  return {
    kind: String(device.kind || "unknown"),
    label: String(device.label || ""),
    deviceIdPresent: Boolean(device.deviceId),
    groupIdPresent: Boolean(device.groupId),
  };
}

function serializeMediaError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || String(error)),
    stack: error?.stack || null,
  };
}

// Helper function to check for available media devices
async function checkMediaDevices(kind = 'videoinput') {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Media device enumeration is not supported in this browser.");
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.info("[LiveKitMediaDebug] enumerateDevices:success", {
      requestedKind: kind,
      totalDevices: devices.length,
      devices: devices.map(serializeMediaDevice),
    });
    const availableDevices = devices.filter(d => d.kind === kind);
    console.info("[LiveKitMediaDebug] enumerateDevices:filtered", {
      requestedKind: kind,
      matchedDevices: availableDevices.length,
      devices: availableDevices.map(serializeMediaDevice),
    });
    return availableDevices;
  } catch (error) {
    console.error("[LiveKitMediaDebug] enumerateDevices:error", {
      requestedKind: kind,
      error: serializeMediaError(error),
    });
    throw new Error(`Cannot access media devices: ${error.message}`);
  }
}

// Helper function to check browser permissions
async function checkBrowserPermissions(kind = 'camera') {
  try {
    // Check if browser supports Permissions API
    if (!navigator.permissions || !navigator.permissions.query) {
      console.info("[LiveKitMediaDebug] permissions:unsupported", { kind });
      return null;
    }
    
    const permissionName = kind === 'camera' ? 'camera' : 'microphone';
    const permission = await navigator.permissions.query({ name: permissionName });
    console.info("[LiveKitMediaDebug] permissions:state", {
      kind,
      permissionName,
      state: permission?.state || null,
    });
    return permission.state;
  } catch (error) {
    console.error("[LiveKitMediaDebug] permissions:error", {
      kind,
      error: serializeMediaError(error),
    });
    return null;
  }
}

function mapMicrophoneError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();

  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission")) {
    const host = typeof window !== "undefined" ? String(window.location?.host || "this site") : "this site";
    return `Microphone blocked by browser permissions. Open Site Settings for ${host}, set Microphone to Allow, reload the page, then try again.`;
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
    const host = typeof window !== "undefined" ? String(window.location?.host || "this site") : "this site";
    return `Browser blocked camera or microphone. Open Site Settings for ${host}, set Camera and Microphone to Allow, reload the page, then try again.`;
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera or microphone device was detected. Connect your devices and try again.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera or microphone is currently busy in another application. Close other apps and try again.";
  }

  return error?.message || "Unable to verify camera and microphone permissions.";
}

async function probeMediaAccess(kind = "camera") {
  const requestedKind = String(kind || "camera").toLowerCase();
  const isCamera = requestedKind === "camera";
  const requestedConstraints = isCamera ? { video: true, audio: false } : { audio: true, video: false };
  const requestedDeviceKind = isCamera ? "videoinput" : "audioinput";
  const fallbackErrorMessage = isCamera
    ? "No camera device was detected. Connect a camera and try again."
    : "No microphone device was detected. Connect a microphone and try again.";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media capture is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia(requestedConstraints);
    stream.getTracks().forEach((track) => track.stop());

    const devices = await checkMediaDevices(requestedDeviceKind);
    if (!devices.length) {
      throw new Error(fallbackErrorMessage);
    }

    return {
      granted: true,
      available: true,
      kind: requestedKind,
      deviceCount: devices.length,
    };
  } catch (error) {
    const message = String(error?.message || "").trim();
    return {
      granted: false,
      available: false,
      kind: requestedKind,
      deviceCount: 0,
      error: message || fallbackErrorMessage,
    };
  }
}

function mapCameraError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();

  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission")) {
    const host = typeof window !== "undefined" ? String(window.location?.host || "this site") : "this site";
    return `Camera blocked by browser permissions. Open Site Settings for ${host}, set Camera to Allow, reload the page, then try again.`;
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Camera unavailable. No camera was detected. Check that your camera is connected and try again.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera unavailable. Another application may be using your camera. Close other apps and try again.";
  }

  if (name === "OverconstrainedError") {
    return "Camera unavailable. The selected camera could not be activated. Reconnect the device and try again.";
  }

  return "Camera unavailable. Check camera permissions, camera connection, and close other apps using the camera, then try again.";
}

function ensureMediaSecureContext() {
  if (typeof window === "undefined") {
    return;
  }

  if (window.isSecureContext) {
    return;
  }

  const host = String(window.location?.host || "unknown-host");
  throw new Error(`Camera and microphone require a secure origin. Open TMOS using HTTPS (https://${host}), accept the certificate warning once if shown, then allow media permissions.`);
}

function isLikelyMobileClient() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = String(navigator.userAgent || "");
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

function normalizeFacingToken(value) {
  const token = String(value || "").toLowerCase();
  if (token.includes("environment") || token.includes("rear") || token.includes("back")) {
    return "rear";
  }
  if (token.includes("user") || token.includes("front") || token.includes("face")) {
    return "front";
  }
  return "unknown";
}

function inferFacingFromDevice(device) {
  const label = String(device?.label || "").toLowerCase();
  if (!label) {
    return "unknown";
  }

  if (/(rear|back|environment|wide|ultra|main|world)/i.test(label)) {
    return "rear";
  }

  if (/(front|user|selfie|facetime)/i.test(label)) {
    return "front";
  }

  return "unknown";
}

function oppositeFacingMode(facingMode) {
  return facingMode === "rear" ? "front" : "rear";
}

function buildCameraFallbackLabel(index = 0) {
  return `Camera ${index + 1}`;
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
  const token = String(state || "").trim().toLowerCase();
  if (token === "connected") return "Connected";
  if (token === "connecting") return "Connecting";
  if (token === "reconnecting" || token === "signalreconnecting") return "Degraded";
  if (token === "disconnected") return "Offline";
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

function buildAttemptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeToken(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return {
      hasToken: false,
      tokenLength: 0,
      tokenSuffix: "",
    };
  }

  return {
    hasToken: true,
    tokenLength: raw.length,
    tokenSuffix: raw.slice(-12),
  };
}

const CONNECTION_ABORTED_CODE = "TMOS_CONNECTION_ABORTED";

function isExpectedDisconnectMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("received leave request while trying to (re)connect")
    || message.includes("abort connection attempt due to user initiated disconnect")
    || message.includes("got disconnected during reconnection attempt")
  );
}

function buildAbortError() {
  const error = new Error("Connection cancelled by user action.");
  error.code = CONNECTION_ABORTED_CODE;
  return error;
}

function normalizeLiveKitConnectionDetails(rawValue = {}) {
  const source = rawValue?.connectionDetails && typeof rawValue.connectionDetails === "object"
    ? rawValue.connectionDetails
    : rawValue;
  const token = String(
    source?.token
      || source?.accessToken
      || source?.jwt
      || source?.connectionToken
      || rawValue?.token
      || rawValue?.accessToken
      || rawValue?.jwt
      || rawValue?.connectionToken
      || "",
  ).trim();
  const wsUrl = String(
    source?.wsUrl
      || source?.serverUrl
      || source?.livekitUrl
      || source?.url
      || rawValue?.wsUrl
      || rawValue?.serverUrl
      || rawValue?.livekitUrl
      || rawValue?.url
      || "",
  ).trim();

  return {
    ...(source || {}),
    token,
    wsUrl,
  };
}

function buildProductionWsFallbackUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/ws/`;
}

function shouldUpgradeToSecureWs(parsedUrl) {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }

  return window.location.protocol === "https:" && parsedUrl.protocol === "ws:";
}

function normalizeLiveKitWsUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return {
      wsUrl: "",
      rewritten: false,
      reason: "missing-url",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const currentHostWithPort = typeof window !== "undefined" ? String(window.location?.host || "").toLowerCase() : "";
    const targetHostWithPort = String(parsed.host || "").toLowerCase();

    if (shouldUpgradeToSecureWs(parsed)) {
      parsed.protocol = "wss:";
      return {
        wsUrl: parsed.toString(),
        rewritten: true,
        reason: "upgraded-ws-to-wss-for-https-client",
        originalWsUrl: trimmed,
      };
    }

    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";

    if (!isLoopback) {
      const currentHost = typeof window !== "undefined" ? String(window.location?.hostname || "") : "";
      const sameHost = Boolean(currentHost) && host === currentHost.toLowerCase();
      const path = String(parsed.pathname || "/");
      const fallbackUrl = buildProductionWsFallbackUrl();
      const runningOnLocalhostClient = currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost === "::1";

      if (!sameHost && runningOnLocalhostClient && fallbackUrl) {
        return {
          wsUrl: fallbackUrl,
          rewritten: true,
          reason: "prefer-same-origin-proxy-on-localhost-client",
          originalWsUrl: trimmed,
        };
      }

      if (sameHost && (path === "/" || path === "")) {
        parsed.pathname = "/ws/";
        parsed.search = "";
        parsed.hash = "";
        return {
          wsUrl: parsed.toString(),
          rewritten: true,
          reason: "same-host-root-url-normalized-to-ws-path",
          originalWsUrl: trimmed,
        };
      }

      if (sameHost && path === "/ws") {
        parsed.pathname = "/ws/";
        parsed.search = "";
        parsed.hash = "";
        return {
          wsUrl: parsed.toString(),
          rewritten: true,
          reason: "same-host-ws-path-normalized-with-trailing-slash",
          originalWsUrl: trimmed,
        };
      }

      return {
        wsUrl: trimmed,
        rewritten: false,
        reason: "non-loopback-url",
      };
    }

    const fallbackUrl = buildProductionWsFallbackUrl();
    const currentHost = typeof window !== "undefined" ? String(window.location?.hostname || "") : "";
    const runningLocally = currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost === "::1";

    // In SSH/remote forwarded sessions, the browser can be localhost on a different
    // port than the LiveKit loopback target. In that case, force same-origin proxy.
    if (fallbackUrl && currentHostWithPort && targetHostWithPort && currentHostWithPort !== targetHostWithPort) {
      return {
        wsUrl: fallbackUrl,
        rewritten: true,
        reason: "rewrote-loopback-url-for-host-port-mismatch",
        originalWsUrl: trimmed,
      };
    }

    if (!fallbackUrl || runningLocally) {
      return {
        wsUrl: trimmed,
        rewritten: false,
        reason: "loopback-url-allowed",
      };
    }

    return {
      wsUrl: fallbackUrl,
      rewritten: true,
      reason: "rewrote-loopback-url-for-remote-client",
      originalWsUrl: trimmed,
    };
  } catch {
    return {
      wsUrl: trimmed,
      rewritten: false,
      reason: "url-parse-failed",
    };
  }
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
      cameraTrackVersion: 0,
      microphoneEnabled: false,
      cameraFacingMode: "unknown",
      cameraSwitchAvailable: false,
      cameraSwitchInProgress: false,
      availableVideoInputCount: 0,
      cameraControlMode: isLikelyMobileClient() ? "mobile" : "desktop",
      cameraProfile: "hd",
      cameraZoom: 1,
      cameraStabilizationMode: "off",
      videoInputDevices: [],
      selectedVideoDeviceId: "",
      wsConnected: false,
      lastError: "",
    };
    this.pollingTimer = null;
    this.currentJoinAttemptId = null;
    this.lastJoinAttemptId = null;
    this.intentionalDisconnect = false;
    this.cameraMutationInProgress = false;
  }

  log(step, details = {}) {
    console.info("[LiveKitService]", step, details);
  }

  bumpCameraTrackVersion() {
    this.state = {
      ...this.state,
      cameraTrackVersion: Number(this.state.cameraTrackVersion || 0) + 1,
    };
  }

  async runExclusiveCameraMutation(label, operation) {
    if (this.cameraMutationInProgress) {
      throw new Error("Another camera operation is already in progress. Wait a moment and try again.");
    }

    this.cameraMutationInProgress = true;
    this.log("camera:mutation:start", { label });

    try {
      const result = await operation();
      this.log("camera:mutation:success", { label });
      return result;
    } catch (error) {
      this.log("camera:mutation:error", {
        label,
        message: error?.message || String(error),
      });
      throw error;
    } finally {
      this.cameraMutationInProgress = false;
      this.log("camera:mutation:end", { label });
    }
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
    if (this.localTracks.camera) {
      return this.localTracks.camera;
    }

    if (!this.roomClient?.localParticipant) {
      return null;
    }

    const localPublication = Array.from(this.roomClient.localParticipant.videoTrackPublications.values())
      .find((publication) => publication?.track) || null;

    const localTrack = localPublication?.videoTrack || localPublication?.track || null;
    if (localTrack) {
      this.localTracks.camera = localTrack;
    }

    return localTrack;
  }

  getLocalMicrophoneTrack() {
    return this.localTracks.microphone || null;
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

  getAudioTrackForParticipant(identity) {
    const participantIdentity = String(identity || "").trim();
    if (!participantIdentity || !this.roomClient || !this.state.wsConnected) {
      return null;
    }

    if (participantIdentity === this.state.participantIdentity) {
      if (this.localTracks.microphone) {
        return this.localTracks.microphone;
      }

      const localPublication = Array.from(this.roomClient.localParticipant.audioTrackPublications.values())
        .find((publication) => publication?.track) || null;
      return localPublication?.audioTrack || localPublication?.track || null;
    }

    const remoteParticipant = Array.from(this.roomClient.remoteParticipants.values())
      .find((participant) => participant.identity === participantIdentity) || null;

    if (!remoteParticipant) {
      return null;
    }

    const remotePublication = Array.from(remoteParticipant.audioTrackPublications.values())
      .find((publication) => publication?.track && !publication.isMuted)
      || Array.from(remoteParticipant.audioTrackPublications.values()).find((publication) => publication?.track)
      || null;

    return remotePublication?.audioTrack || remotePublication?.track || null;
  }

  getProducerTalkbackTrack() {
    if (!this.roomClient || !this.state.wsConnected) {
      return null;
    }

    const producerParticipant = Array.from(this.roomClient.remoteParticipants.values())
      .find((participant) => isProducerIdentity(participant)) || null;

    if (!producerParticipant) {
      return null;
    }

    const publication = Array.from(producerParticipant.audioTrackPublications.values())
      .find((item) => Boolean(item?.track && !item?.isMuted))
      || Array.from(producerParticipant.audioTrackPublications.values()).find((item) => Boolean(item?.track))
      || null;

    const track = publication?.audioTrack || publication?.track || null;
    if (!track) {
      return null;
    }

    return {
      track,
      participantIdentity: String(producerParticipant.identity || "").trim() || "producer",
      muted: Boolean(publication?.isMuted),
    };
  }

  getSnapshot() {
    return {
      ...this.state,
      participants: [...this.state.participants],
    };
  }

  buildCameraConstraints({ preferredFacing = "rear", preferredDeviceId = "" } = {}) {
    const safeFacing = preferredFacing === "front" ? "front" : "rear";
    const facingMode = safeFacing === "rear" ? "environment" : "user";
    const profileKey = normalizeCameraProfile(this.state.cameraProfile);
    const profile = CAMERA_PROFILES[profileKey] || CAMERA_PROFILES.hd;
    const options = {
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    };

    const safeDeviceId = String(preferredDeviceId || "").trim();
    if (safeDeviceId) {
      options.deviceId = { exact: safeDeviceId };
      return options;
    }

    if (isLikelyMobileClient()) {
      options.facingMode = { ideal: facingMode };
    }

    return options;
  }

  inferTrackFacingMode(track, knownDevices = []) {
    const mediaTrack = track?.mediaStreamTrack || null;
    const settings = mediaTrack && typeof mediaTrack.getSettings === "function"
      ? mediaTrack.getSettings() || {}
      : {};

    const settingFacing = normalizeFacingToken(settings.facingMode);
    if (settingFacing !== "unknown") {
      return settingFacing;
    }

    const settingDeviceId = String(settings.deviceId || "").trim();
    if (settingDeviceId) {
      const matched = knownDevices.find((device) => String(device?.deviceId || "") === settingDeviceId);
      const inferred = inferFacingFromDevice(matched);
      if (inferred !== "unknown") {
        return inferred;
      }
    }

    return this.state.cameraFacingMode || (isLikelyMobileClient() ? "rear" : "front");
  }

  refreshCameraSwitchCapabilities(cameraDevices = [], facingMode = "unknown") {
    const devices = Array.isArray(cameraDevices) ? cameraDevices : [];
    const hasMultiple = devices.length > 1;
    const canSwitch = hasMultiple || isLikelyMobileClient();

    this.state = {
      ...this.state,
      availableVideoInputCount: devices.length,
      cameraSwitchAvailable: canSwitch,
      cameraFacingMode: normalizeFacingToken(facingMode),
    };
  }

  async refreshVideoInputDevices({ emit = false } = {}) {
    let cameraDevices = [];
    try {
      cameraDevices = await checkMediaDevices("videoinput");
    } catch {
      cameraDevices = [];
    }

    const normalized = cameraDevices.map((device, index) => {
      const label = String(device?.label || "").trim() || buildCameraFallbackLabel(index);
      return {
        deviceId: String(device?.deviceId || ""),
        label,
        facingMode: inferFacingFromDevice(device),
      };
    }).filter((device) => Boolean(device.deviceId));

    const currentlySelected = String(this.state.selectedVideoDeviceId || "").trim();
    const selectedStillExists = normalized.some((device) => device.deviceId === currentlySelected);
    const nextSelected = selectedStillExists
      ? currentlySelected
      : (normalized[0]?.deviceId || "");
    const selectedDevice = normalized.find((device) => device.deviceId === nextSelected) || null;
    const nextFacing = selectedDevice?.facingMode || this.state.cameraFacingMode || "unknown";

    this.state = {
      ...this.state,
      cameraControlMode: isLikelyMobileClient() ? "mobile" : "desktop",
      videoInputDevices: normalized,
      selectedVideoDeviceId: nextSelected,
      availableVideoInputCount: normalized.length,
      cameraSwitchAvailable: (isLikelyMobileClient() || normalized.length > 1),
      cameraFacingMode: normalizeFacingToken(nextFacing),
    };

    if (emit) {
      this.emitAll();
    }

    return normalized;
  }

  pickCameraByFacing(cameraDevices = [], preferredFacing = "rear", excludedDeviceId = "") {
    const devices = Array.isArray(cameraDevices)
      ? cameraDevices.filter((device) => device?.deviceId && device.deviceId !== "default" && device.deviceId !== "communications")
      : [];

    if (!devices.length) {
      return null;
    }

    const excluded = String(excludedDeviceId || "").trim();
    const preferred = devices.find((device) => inferFacingFromDevice(device) === preferredFacing && String(device.deviceId) !== excluded)
      || devices.find((device) => String(device.deviceId) !== excluded)
      || null;

    return preferred;
  }

  async createCameraTrack({ preferredFacing = "rear", preferredDeviceId = "", excludedDeviceId = "" } = {}) {
    let cameraDevices = [];
    try {
      cameraDevices = await checkMediaDevices("videoinput");
    } catch {
      cameraDevices = [];
    }

    const explicitDeviceId = String(preferredDeviceId || "").trim();
    const explicitDevice = explicitDeviceId
      ? cameraDevices.find((device) => String(device?.deviceId || "") === explicitDeviceId) || null
      : null;
    const preferredDevice = explicitDevice || this.pickCameraByFacing(cameraDevices, preferredFacing, excludedDeviceId);
    const attempts = [];

    if (preferredDevice?.deviceId) {
      attempts.push({
        label: "camera:create-local-video-track:preferred-device",
        options: this.buildCameraConstraints({ preferredFacing, preferredDeviceId: preferredDevice.deviceId }),
      });
    }

    attempts.push({
      label: "camera:create-local-video-track:facing-mode",
      options: this.buildCameraConstraints({ preferredFacing }),
    });
    attempts.push({
      label: "camera:create-local-video-track:default-device",
      options: {},
    });

    let lastError = null;
    for (const attempt of attempts) {
      try {
        const track = await traceAwait(
          attempt.label,
          () => createLocalVideoTrack(attempt.options),
          this.log.bind(this),
        );

        const resolvedFacing = this.inferTrackFacingMode(track, cameraDevices);
        return {
          track,
          cameraDevices,
          preferredDevice,
          resolvedFacing,
        };
      } catch (error) {
        lastError = error;
        this.log("camera:create-track:attempt-failed", {
          label: attempt.label,
          message: error?.message || String(error),
        });
      }
    }

    throw lastError || new Error("Unable to create camera track.");
  }

  async listRooms() {
    const response = await APIClient.get(API_CONFIG.endpoints.media.rooms);
    const payload = response?.data?.data || [];
    return Array.isArray(payload) ? payload : [];
  }

  async ensureRoom(roomName) {
    const targetName = String(roomName || DEFAULT_ROOM_NAME).trim();
    const rooms = await this.listRooms();
    const cacheKey = `${ROOM_CACHE_PREFIX}${targetName.toLowerCase()}`;
    let cachedRoomId = "";

    try {
      cachedRoomId = String(window?.localStorage?.getItem(cacheKey) || "").trim();
    } catch {
      cachedRoomId = "";
    }

    const preferredRoom = resolvePreferredRoomByName(rooms, targetName);
    const cachedRoom = cachedRoomId
      ? (Array.isArray(rooms) ? rooms : []).find((room) => String(room?.id || "").trim() === cachedRoomId) || null
      : null;
    const existing = cachedRoom || preferredRoom;

    if (existing) {
      try {
        window?.localStorage?.setItem(cacheKey, String(existing.id || ""));
      } catch {
        // ignore localStorage failures for private-mode browsers
      }
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

    const createdRoom = createResponse?.data?.data || createResponse?.data || {};
    const resolvedRoom = {
      ...createdRoom,
      name: createdRoom.name || createdRoom.roomName || targetName,
    };

    try {
      window?.localStorage?.setItem(cacheKey, String(resolvedRoom.id || ""));
    } catch {
      // ignore localStorage failures for private-mode browsers
    }

    return resolvedRoom;
  }

  async setCameraProfile(profile) {
    const nextProfile = normalizeCameraProfile(profile);
    this.state = {
      ...this.state,
      cameraProfile: nextProfile,
      lastError: "",
    };

    if (!this.localTracks.camera || !this.roomClient || !this.state.wsConnected) {
      this.emitAll();
      return this.getSnapshot();
    }

    return this.runExclusiveCameraMutation("set-camera-profile", async () => {
      this.state = {
        ...this.state,
        cameraSwitchInProgress: true,
      };
      this.emitAll();

      try {
        await this.replacePublishedCameraTrack({ preferredDeviceId: this.state.selectedVideoDeviceId });
        await this.applyCameraEnhancements({
          zoom: this.state.cameraZoom,
          stabilizationMode: this.state.cameraStabilizationMode,
        });

        this.state = {
          ...this.state,
          cameraEnabled: true,
          cameraSwitchInProgress: false,
          lastError: "",
        };

        await this.persistParticipantMediaState();
        this.emitAll();
        return this.getSnapshot();
      } catch (error) {
        const userFriendlyError = mapCameraError(error);
        this.state = {
          ...this.state,
          cameraSwitchInProgress: false,
          lastError: userFriendlyError,
        };
        this.emitAll();
        throw new Error(userFriendlyError);
      }
    });
  }

  async applyCameraEnhancements({ zoom = null, stabilizationMode = null } = {}) {
    const localCameraTrack = this.localTracks.camera;
    if (!localCameraTrack?.mediaStreamTrack) {
      if (zoom !== null && Number.isFinite(Number(zoom))) {
        this.state = {
          ...this.state,
          cameraZoom: clamp(Number(zoom), 1, 8),
        };
      }

      if (stabilizationMode !== null) {
        this.state = {
          ...this.state,
          cameraStabilizationMode: String(stabilizationMode || "off").toLowerCase() === "auto" ? "auto" : "off",
        };
      }

      this.emitAll();
      return this.getSnapshot();
    }

    const mediaTrack = localCameraTrack.mediaStreamTrack;
    const capabilities = typeof mediaTrack.getCapabilities === "function"
      ? mediaTrack.getCapabilities() || {}
      : {};
    const advancedConstraints = {};

    if (zoom !== null && Number.isFinite(Number(zoom))) {
      const requestedZoom = Number(zoom);
      const minZoom = Number.isFinite(Number(capabilities?.zoom?.min)) ? Number(capabilities.zoom.min) : 1;
      const maxZoom = Number.isFinite(Number(capabilities?.zoom?.max)) ? Number(capabilities.zoom.max) : 8;
      const clampedZoom = clamp(requestedZoom, minZoom, maxZoom);

      if (capabilities?.zoom) {
        advancedConstraints.zoom = clampedZoom;
      }

      this.state = {
        ...this.state,
        cameraZoom: clampedZoom,
      };
    }

    if (stabilizationMode !== null) {
      const requestedMode = String(stabilizationMode || "off").toLowerCase() === "auto" ? "auto" : "off";
      const supportedStabilizationModes = Array.isArray(capabilities?.stabilizationMode)
        ? capabilities.stabilizationMode.map((mode) => String(mode || "").toLowerCase())
        : [];

      if (supportedStabilizationModes.includes(requestedMode)) {
        advancedConstraints.stabilizationMode = requestedMode;
      }

      this.state = {
        ...this.state,
        cameraStabilizationMode: requestedMode,
      };
    }

    if (Object.keys(advancedConstraints).length > 0 && typeof mediaTrack.applyConstraints === "function") {
      await mediaTrack.applyConstraints({ advanced: [advancedConstraints] });
    }

    this.emitAll();
    return this.getSnapshot();
  }

  async joinRoom({ roomName, identity, role = "reporter", reporterId = null, metadata = {} }) {
    try {
      this.intentionalDisconnect = false;
      const attemptId = buildAttemptId();
      this.currentJoinAttemptId = attemptId;
      this.lastJoinAttemptId = attemptId;
      const tokenRequestUrl = buildRequestUrl(API_CONFIG.baseURL, API_CONFIG.endpoints.media.joinSession);
      this.log("join:start", {
        attemptId,
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

      this.log("join:ensure-room:before-await", { roomName });
      const ensuredRoom = await traceAwait(
        "join:ensure-room",
        () => this.ensureRoom(roomName),
        this.log.bind(this),
      );
      this.log("join:ensure-room:after-await", { roomId: ensuredRoom?.id || null, roomName: ensuredRoom?.name || null });
      const safeName = safeIdentity(identity) || `participant-${Date.now()}`;
      this.log("join:room-ensured", { roomId: ensuredRoom?.id || null, roomName: ensuredRoom?.name || null });

      let joinResponse;
      try {
        this.log("join:token-request:send", {
          attemptId,
          tokenRequestUrl,
          roomId: ensuredRoom.id,
          participantIdentity: safeName,
        });
        this.log("pipeline:step1:token-request-sent", {
          attemptId,
          tokenRequestUrl,
          roomId: ensuredRoom.id,
          participantIdentity: safeName,
        });
        this.log("join:token-request:before-await", { tokenRequestUrl });
        joinResponse = await traceAwait(
          "join:token-request",
          () => APIClient.post(API_CONFIG.endpoints.media.joinSession, {
            roomId: ensuredRoom.id,
            participantIdentity: safeName,
            participantRole: role,
            reporterId,
            metadata,
          }),
          this.log.bind(this),
        );
        this.log("join:token-request:after-await", { status: joinResponse?.status ?? null });
        this.log("pipeline:step2:backend-response", {
          attemptId,
          status: joinResponse?.status ?? null,
          ok: Number(joinResponse?.status) >= 200 && Number(joinResponse?.status) < 300,
        });
      } catch (error) {
        const nowIso = new Date().toISOString();
        const accessToken = getAccessToken();
        const tokenExpiresAt = getTokenExpiryIso(accessToken);

        this.log("join:token-error", {
          attemptId,
          tokenRequestUrl,
          status: error?.response?.status ?? null,
          body: error?.response?.data ?? null,
          message: error?.message || String(error),
          stack: error?.stack || null,
          tokenDiagnostics: {
            issueTime: nowIso,
            tokenExpiresAt,
            deviceTime: nowIso,
          },
        });

        if (isAuthTokenExpiredError(error)) {
          this.state = {
            ...this.state,
            connectionState: "Connecting",
            lastError: "Refreshing secure session...",
          };
          this.emitAll();

          this.log("join:token-refresh:attempt", {
            attemptId,
            reason: getApiErrorMessage(error),
            status: error?.response?.status ?? null,
            tokenExpiresAt,
            deviceTime: nowIso,
          });

          try {
            await traceAwait(
              "join:token-refresh",
              () => refreshAccessSession(),
              this.log.bind(this),
            );

            this.log("join:token-refresh:retry", {
              attemptId,
              tokenRequestUrl,
              roomId: ensuredRoom.id,
              participantIdentity: safeName,
            });

            joinResponse = await traceAwait(
              "join:token-request:retry-after-refresh",
              () => APIClient.post(API_CONFIG.endpoints.media.joinSession, {
                roomId: ensuredRoom.id,
                participantIdentity: safeName,
                participantRole: role,
                reporterId,
                metadata,
              }),
              this.log.bind(this),
            );

            this.log("join:token-refresh:retry-success", {
              attemptId,
              status: joinResponse?.status ?? null,
            });

            this.state = {
              ...this.state,
              lastError: "",
            };
            this.emitAll();
          } catch (refreshError) {
            clearStoredAuth();
            this.log("join:token-refresh:retry-failed", {
              attemptId,
              status: refreshError?.response?.status ?? null,
              message: refreshError?.message || String(refreshError),
            });
            throw new Error("Secure session expired. Please sign in again.");
          }
          // retry succeeded
        } else {
          throw error;
        }
      }

      this.log("join:token-response", {
        attemptId,
        participantIdentity: safeName,
        roomId: ensuredRoom?.id || null,
        status: joinResponse?.status ?? null,
        body: joinResponse?.data ?? null,
        liveKitUrl: joinResponse?.data?.data?.connectionDetails?.wsUrl || joinResponse?.data?.connectionDetails?.wsUrl || null,
      });

      this.log("join:token-response:parse:before");
      const payload = joinResponse?.data?.data || joinResponse?.data;
      const participant = payload?.participant || null;
      const resolvedParticipantIdentity = String(
        payload?.participantIdentity
          || participant?.metadata?.participantIdentity
          || participant?.metadata?.participantSessionId
          || participant?.participantIdentity
          || safeName,
      ).trim();
      const connectionDetails = normalizeLiveKitConnectionDetails(payload?.connectionDetails || payload || {});
      const tokenSummary = summarizeToken(connectionDetails?.token);
      this.log("join:token-response:parse:after", {
        attemptId,
        hasPayload: Boolean(payload),
        hasParticipant: Boolean(participant),
        hasConnectionDetails: Boolean(connectionDetails?.wsUrl && connectionDetails?.token),
      });
      this.log("pipeline:step3:token-received", {
        attemptId,
        ...tokenSummary,
      });
      this.log("pipeline:step4:ws-url-received", {
        attemptId,
        wsUrl: connectionDetails?.wsUrl || null,
      });

      this.roomContext = {
        roomId: ensuredRoom.id,
        roomName: ensuredRoom.name,
        participantId: participant?.id || null,
        participantIdentity: resolvedParticipantIdentity,
        participantRole: role,
      };

      this.state = {
        ...this.state,
        roomId: ensuredRoom.id,
        roomName: ensuredRoom.name,
        participantId: participant?.id || null,
        participantIdentity: resolvedParticipantIdentity,
        participantRole: role,
        isJoined: false,
        connectionState: "Connecting",
        wsConnected: false,
        lastError: "",
      };

      this.emitAll();

      this.log("join:connect-room-client:before-await", { wsUrl: connectionDetails?.wsUrl || null });
      await traceAwait(
        "join:connect-room-client",
        () => this.connectRoomClient(connectionDetails, { attemptId }),
        this.log.bind(this),
      );
      this.log("join:connect-room-client:after-await", { roomState: this.roomClient?.state || null });
      this.state = {
        ...this.state,
        isJoined: true,
      };

      this.log("join:sync-participants:before-await");
      await traceAwait(
        "join:sync-participants",
        () => this.syncParticipants(),
        this.log.bind(this),
      );
      this.log("join:sync-participants:after-await", { participants: this.state.participants.length });
      await this.refreshVideoInputDevices();
      this.startPolling();
      this.emitAll();
      return this.getSnapshot();
    } catch (error) {
      if (error?.code === CONNECTION_ABORTED_CODE) {
        this.state = {
          ...this.state,
          isJoined: false,
          wsConnected: false,
          connectionState: "Offline",
          lastError: "",
        };
        this.emitAll();
        return null;
      }

      this.state = {
        ...this.state,
        isJoined: false,
        wsConnected: false,
        connectionState: "Error",
        lastError: error?.message || String(error),
      };
      this.log("join:error", {
        attemptId: this.currentJoinAttemptId,
        message: error?.message || String(error),
        stack: error?.stack || null,
        status: error?.response?.status ?? null,
        body: error?.response?.data ?? null,
      });
      this.emitAll();
      throw error instanceof Error ? error : new Error(error?.message || String(error));
    } finally {
      this.currentJoinAttemptId = null;
    }
  }

  async preflightMediaPermissions() {
    try {
      this.log("permissions:start");
      ensureMediaSecureContext();
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media capture is not supported in this browser.");
      }

      const [cameraPermission, microphonePermission] = await Promise.all([
        checkBrowserPermissions("camera"),
        checkBrowserPermissions("microphone"),
      ]);
      this.log("permissions:browser-state", { cameraPermission, microphonePermission });

      const [cameraProbe, microphoneProbe] = await Promise.all([
        probeMediaAccess("camera"),
        probeMediaAccess("microphone"),
      ]);

      const cameraGranted = Boolean(cameraProbe?.granted);
      const microphoneGranted = Boolean(microphoneProbe?.granted);
      const message = cameraGranted && microphoneGranted
        ? "Camera and microphone access granted."
        : cameraGranted
          ? "Camera access granted. Microphone is unavailable in this environment."
          : microphoneGranted
            ? "Microphone access granted. Camera is unavailable in this environment."
            : "No camera or microphone device was detected. Connect your devices and try again.";

      this.log("permissions:probe-results", {
        cameraGranted,
        microphoneGranted,
        cameraError: cameraProbe?.error || null,
        microphoneError: microphoneProbe?.error || null,
      });

      this.state = {
        ...this.state,
        lastError: "",
      };
      await this.refreshVideoInputDevices();
      this.emitAll();
      this.log("permissions:granted", { cameraGranted, microphoneGranted, message });

      return {
        cameraGranted,
        microphoneGranted,
        message,
      };
    } catch (error) {
      const message = mapPermissionPreflightError(error);
      this.log("permissions:error", { message, error: serializeMediaError(error) });
      this.state = {
        ...this.state,
        lastError: message,
      };
      this.emitAll();
      throw new Error(message);
    }
  }

  async leaveRoom() {
    this.intentionalDisconnect = true;
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
      cameraFacingMode: "unknown",
      cameraSwitchAvailable: false,
      cameraSwitchInProgress: false,
      availableVideoInputCount: 0,
      cameraControlMode: isLikelyMobileClient() ? "mobile" : "desktop",
      videoInputDevices: [],
      selectedVideoDeviceId: "",
      wsConnected: false,
      lastError: "",
    };
    this.emitAll();
    this.log("leave:complete");
  }

  async publishCamera(enabled) {
    this.log("publishCamera:invoke", { enabled });
    if (!enabled && this.localTracks.camera) {
      const track = this.localTracks.camera;
      try {
        this.log("camera:disable:start");
        if (this.roomClient) {
          await this.roomClient.localParticipant.unpublishTrack(track);
        }
      } catch (error) {
        this.log("camera:disable:unpublish-warning", {
          message: error?.message || String(error),
        });
      }

      try {
        track.stop();
      } catch (stopError) {
        this.log("camera:disable:stop-warning", {
          message: stopError?.message || String(stopError),
        });
      }
      this.localTracks.camera = null;
      this.bumpCameraTrackVersion();

      this.state = {
        ...this.state,
        cameraEnabled: false,
        cameraSwitchInProgress: false,
      };
      await this.persistParticipantMediaState();
      this.emitAll();
      this.log("camera:disabled");
      return this.getSnapshot();
    }

    if (!this.roomClient || (!this.state.wsConnected && !this.roomContext?.participantId)) {
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
        ensureMediaSecureContext();
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera capture is not supported in this browser.");
        }

        const permissionState = await checkBrowserPermissions('camera');
        if (permissionState === 'denied') {
          // Some browser/proxy combinations can report a stale denied state here.
          // We still attempt track creation once so a real permission prompt can surface.
          this.log("camera:permission-api-reported-denied", { permissionState });
        }

        let cameraDevices = [];
        try {
          cameraDevices = await checkMediaDevices('videoinput');
          if (!cameraDevices.length) {
            this.log("camera:warmup-getUserMedia-attempt", { constraints: { video: true } });
            const warmupStream = await navigator.mediaDevices.getUserMedia({ video: true });
            warmupStream.getTracks().forEach((track) => track.stop());
            this.log("camera:warmup-getUserMedia-success");
            cameraDevices = await checkMediaDevices('videoinput');
          }

          if (!cameraDevices.length) {
            throw new Error("No camera device was detected. Connect a camera and try again.");
          }

          this.log("camera:devices-detected", {
            cameraDevices: cameraDevices.length,
            devices: cameraDevices.map(serializeMediaDevice),
          });
        } catch (deviceError) {
          // Device enumeration is inconsistent on some mobile browsers; try opening a track anyway.
          this.log("camera:devices-enumeration-warning", {
            message: deviceError?.message || String(deviceError),
            error: serializeMediaError(deviceError),
          });
        }

        const defaultFacing = this.state.cameraFacingMode !== "unknown"
          ? this.state.cameraFacingMode
          : (isLikelyMobileClient() ? "rear" : "front");
        const selectedVideoDeviceId = String(this.state.selectedVideoDeviceId || "").trim();

        const {
          track: videoTrack,
          cameraDevices: resolvedCameraDevices,
          resolvedFacing,
        } = await this.createCameraTrack({
          preferredFacing: defaultFacing,
          preferredDeviceId: selectedVideoDeviceId,
        });

        this.log("camera:publishTrack:attempt", { trackKind: videoTrack?.kind || null });
        await traceAwait(
          "camera:publish-track",
          () => this.roomClient.localParticipant.publishTrack(videoTrack),
          this.log.bind(this),
        );
        this.log("camera:publishTrack:success", { trackSid: videoTrack?.sid || null });

        this.localTracks.camera = videoTrack;
        this.bumpCameraTrackVersion();

        // Update UI state only after successful publish.
        this.state = {
          ...this.state,
          cameraEnabled: true,
          cameraSwitchInProgress: false,
          cameraFacingMode: normalizeFacingToken(resolvedFacing),
          availableVideoInputCount: Array.isArray(resolvedCameraDevices) ? resolvedCameraDevices.length : 0,
          cameraSwitchAvailable: (Array.isArray(resolvedCameraDevices) ? resolvedCameraDevices.length > 1 : false) || isLikelyMobileClient(),
          selectedVideoDeviceId: selectedVideoDeviceId || this.state.selectedVideoDeviceId,
        };
        await this.refreshVideoInputDevices();
        await this.persistParticipantMediaState();
        this.emitAll();
        this.log("camera:enabled");
        return this.getSnapshot();
      } catch (error) {
        const userFriendlyError = mapCameraError(error);
        // ===== KEEP UI IN FALSE STATE ON FAILURE =====
        this.log("camera:publishTrack:error", {
          message: error?.message || String(error),
          stack: error?.stack || null,
        });
        this.state = {
          ...this.state,
          cameraEnabled: false,
          cameraSwitchInProgress: false,
          lastError: userFriendlyError,
        };
        this.emitAll();
        throw new Error(userFriendlyError);
      }
    }

    // ===== ALREADY ENABLED OR NO-OP - RETURN CURRENT STATE =====
    return this.getSnapshot();
  }

  async switchCamera() {
    if (!this.roomClient || !this.state.wsConnected) {
      throw new Error("Connect to the broadcast room before switching camera.");
    }

    if (!this.localTracks.camera) {
      throw new Error("Start camera before switching between front and rear lenses.");
    }

    return this.runExclusiveCameraMutation("switch-camera", async () => {
      const currentTrack = this.localTracks.camera;
      const currentSettings = typeof currentTrack?.mediaStreamTrack?.getSettings === "function"
        ? currentTrack.mediaStreamTrack.getSettings() || {}
        : {};
      const currentDeviceId = String(currentSettings.deviceId || "").trim();
      const currentFacing = normalizeFacingToken(this.state.cameraFacingMode || currentSettings.facingMode || "");
      const targetFacing = oppositeFacingMode(currentFacing === "unknown" ? "rear" : currentFacing);

      this.state = {
        ...this.state,
        cameraSwitchInProgress: true,
        lastError: "",
      };
      this.emitAll();

      try {
        const switched = await this.replacePublishedCameraTrack({
          preferredFacing: targetFacing,
          excludedDeviceId: currentDeviceId,
        });

        const nextFacing = switched?.resolvedFacing || targetFacing;
        this.state = {
          ...this.state,
          cameraEnabled: true,
          cameraSwitchInProgress: false,
          cameraFacingMode: normalizeFacingToken(nextFacing),
        };
        await this.refreshVideoInputDevices();
        await this.persistParticipantMediaState();
        this.emitAll();
        return this.getSnapshot();
      } catch (error) {
        const userFriendlyError = mapCameraError(error);
        const hasLocalCameraTrack = Boolean(this.localTracks.camera?.mediaStreamTrack);
        this.log("camera:switch:error", {
          message: error?.message || String(error),
          stack: error?.stack || null,
        });
        this.state = {
          ...this.state,
          cameraEnabled: hasLocalCameraTrack,
          cameraSwitchInProgress: false,
          lastError: userFriendlyError,
        };
        this.emitAll();
        throw new Error(userFriendlyError);
      }
    });
  }

  async replacePublishedCameraTrack({ preferredFacing = "rear", preferredDeviceId = "", excludedDeviceId = "" } = {}) {
    const currentTrack = this.localTracks.camera;
    if (!currentTrack) {
      throw new Error("Start camera before switching video source.");
    }

    const {
      track: replacementTrack,
      cameraDevices,
      resolvedFacing,
    } = await this.createCameraTrack({ preferredFacing, preferredDeviceId, excludedDeviceId });

    const replacementSettings = typeof replacementTrack?.mediaStreamTrack?.getSettings === "function"
      ? replacementTrack.mediaStreamTrack.getSettings() || {}
      : {};
    const replacementDeviceId = String(replacementSettings.deviceId || "").trim();

    try {
      // Transactional switch: publish replacement first, then retire current track.
      await traceAwait(
        "camera:switch:publish-replacement",
        () => this.roomClient.localParticipant.publishTrack(replacementTrack),
        this.log.bind(this),
      );
    } catch (publishError) {
      try {
        replacementTrack.stop();
      } catch {
        // Ignore cleanup failures for replacement track after publish failure.
      }
      throw publishError;
    }

    try {
      await traceAwait(
        "camera:switch:unpublish-previous",
        () => this.roomClient.localParticipant.unpublishTrack(currentTrack),
        this.log.bind(this),
      );
    } catch (unpublishError) {
      this.log("camera:switch:unpublish-previous:warning", {
        message: unpublishError?.message || String(unpublishError),
      });
    }

    try {
      currentTrack.stop();
    } catch {
      // Ignore local track stop errors while preserving session continuity.
    }

    this.localTracks.camera = replacementTrack;
    this.bumpCameraTrackVersion();

    const normalizedFacing = normalizeFacingToken(resolvedFacing || preferredFacing);
    this.refreshCameraSwitchCapabilities(cameraDevices, normalizedFacing);

    const selectedVideoDeviceId = replacementDeviceId || this.state.selectedVideoDeviceId;
    this.state = {
      ...this.state,
      selectedVideoDeviceId,
      cameraFacingMode: normalizedFacing,
    };

    return {
      resolvedFacing: normalizedFacing,
      selectedVideoDeviceId,
    };
  }

  async selectVideoInput(deviceId) {
    const nextDeviceId = String(deviceId || "").trim();
    if (!nextDeviceId) {
      throw new Error("Select a valid video source.");
    }

    return this.runExclusiveCameraMutation("select-video-input", async () => {
      const devices = await this.refreshVideoInputDevices();
      const selected = devices.find((device) => device.deviceId === nextDeviceId);
      if (!selected) {
        throw new Error("Selected camera is no longer available.");
      }

      this.state = {
        ...this.state,
        selectedVideoDeviceId: nextDeviceId,
        cameraFacingMode: normalizeFacingToken(selected.facingMode || this.state.cameraFacingMode),
        lastError: "",
      };

      if (!this.localTracks.camera || !this.roomClient || !this.state.wsConnected) {
        this.emitAll();
        return this.getSnapshot();
      }

      this.state = {
        ...this.state,
        cameraSwitchInProgress: true,
      };
      this.emitAll();

      try {
        await this.replacePublishedCameraTrack({ preferredDeviceId: nextDeviceId });
        this.state = {
          ...this.state,
          cameraEnabled: true,
          cameraSwitchInProgress: false,
        };
        await this.refreshVideoInputDevices();
        await this.persistParticipantMediaState();
        this.emitAll();
        return this.getSnapshot();
      } catch (error) {
        const userFriendlyError = mapCameraError(error);
        this.state = {
          ...this.state,
          cameraSwitchInProgress: false,
          lastError: userFriendlyError,
        };
        this.emitAll();
        throw new Error(userFriendlyError);
      }
    });
  }

  async publishMicrophone(enabled) {
    this.log("publishMicrophone:invoke", { enabled });
    if (!enabled && this.localTracks.microphone) {
      const track = this.localTracks.microphone;
      try {
        this.log("microphone:disable:start");
        if (this.roomClient) {
          await this.roomClient.localParticipant.unpublishTrack(track);
        }
      } catch (error) {
        this.log("microphone:disable:unpublish-warning", {
          message: error?.message || String(error),
        });
      }

      try {
        track.stop();
      } catch (stopError) {
        this.log("microphone:disable:stop-warning", {
          message: stopError?.message || String(stopError),
        });
      }
      this.localTracks.microphone = null;

      this.state = {
        ...this.state,
        microphoneEnabled: false,
      };
      await this.persistParticipantMediaState();
      this.emitAll();
      this.log("microphone:disabled");
      return this.getSnapshot();
    }

    if (!this.roomClient || (!this.state.wsConnected && !this.roomContext?.participantId)) {
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
        ensureMediaSecureContext();
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone capture is not supported in this browser.");
        }

        const permissionState = await checkBrowserPermissions('microphone');
        if (permissionState === 'denied') {
          // Same approach as camera: try track creation once to avoid false negatives.
          this.log("microphone:permission-api-reported-denied", { permissionState });
        }

        let micDevices = [];
        try {
          micDevices = await checkMediaDevices('audioinput');
          if (!micDevices.length) {
            this.log("microphone:warmup-getUserMedia-attempt", { constraints: { audio: true } });
            const warmupStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            warmupStream.getTracks().forEach((track) => track.stop());
            this.log("microphone:warmup-getUserMedia-success");
            micDevices = await checkMediaDevices('audioinput');
          }

          if (!micDevices.length) {
            throw new Error("No microphone device was detected. Connect a microphone and try again.");
          }
        } catch (deviceError) {
          this.log("microphone:devices-enumeration-warning", {
            message: deviceError?.message || String(deviceError),
            error: serializeMediaError(deviceError),
          });
        }

        this.log("microphone:devices-detected", {
          microphoneDevices: micDevices.length,
          devices: micDevices.map(serializeMediaDevice),
        });

        const preferredDevice = micDevices.find((device) => (
          device.deviceId
          && device.deviceId !== 'default'
          && device.deviceId !== 'communications'
        )) || null;

        let audioTrack;
        try {
          audioTrack = preferredDevice?.deviceId
            ? await createLocalAudioTrack({ deviceId: { exact: preferredDevice.deviceId } })
            : await createLocalAudioTrack();
        } catch (primaryTrackError) {
          this.log("microphone:create-track:fallback-default", {
            message: primaryTrackError?.message || String(primaryTrackError),
            preferredDeviceIdTried: preferredDevice?.deviceId || null,
          });
          // Retry with browser default device to handle stale/special device IDs.
          audioTrack = await createLocalAudioTrack();
        }
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

  async connectRoomClient(connectionDetails = {}, options = {}) {
    this.disconnectRoomClient();
    const attemptId = options?.attemptId || this.currentJoinAttemptId || "unknown";
    let unresolvedTimer = null;

    const rawWsUrl = String(connectionDetails.wsUrl || "").trim();
    const wsResolution = normalizeLiveKitWsUrl(rawWsUrl);
    const wsUrl = wsResolution.wsUrl;
    const token = String(connectionDetails.token || "").trim();
    this.log("connect:start", {
      liveKitUrl: wsUrl,
      rawLiveKitUrl: rawWsUrl,
      wsUrlRewritten: wsResolution.rewritten,
      wsUrlRewriteReason: wsResolution.reason,
      hasToken: Boolean(token),
      tokenLength: token.length,
    });

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

    this.log("connect:create-room:before");
    this.roomClient = new Room({ adaptiveStream: true, dynacast: true });
    this.log("connect:create-room:after");
    this.bindRoomEvents();

    try {
      this.state = {
        ...this.state,
        connectionState: "Connecting",
        wsConnected: false,
      };
      this.emitAll();
      this.log("connect:attempt", { wsUrl, rawWsUrl });
      this.log("pipeline:step5:room-connect-called", {
        attemptId,
        wsUrl,
        rawWsUrl,
        wsUrlRewritten: wsResolution.rewritten,
        wsUrlRewriteReason: wsResolution.reason,
      });
      this.log("connect:room-connect:before-await", { wsUrl });
      unresolvedTimer = setTimeout(() => {
        this.log("pipeline:step6:room-connect-pending", {
          attemptId,
          elapsedMs: 15000,
          wsUrl,
        });
      }, 15000);
      await traceAwait(
        "connect:room-connect",
        () => this.roomClient.connect(wsUrl, token),
        this.log.bind(this),
      );
      clearTimeout(unresolvedTimer);
      this.log("pipeline:step6:room-connect-resolved", {
        attemptId,
        roomState: this.roomClient?.state || null,
      });
      this.log("connect:room-connect:after-await", { roomState: this.roomClient?.state || null });
      this.state = {
        ...this.state,
        wsConnected: true,
        connectionState: normalizeConnection(this.roomClient.state),
      };
      this.log("connect:success", { connectionState: this.state.connectionState });
    } catch (error) {
      if (unresolvedTimer) {
        clearTimeout(unresolvedTimer);
      }

      if (this.intentionalDisconnect && isExpectedDisconnectMessage(error)) {
        this.log("connect:cancelled", {
          attemptId,
          message: error?.message || String(error),
        });
        this.state = {
          ...this.state,
          wsConnected: false,
          connectionState: "Offline",
          lastError: "",
        };
        throw buildAbortError();
      }

      const fallbackUrl = buildProductionWsFallbackUrl();
      const canRetryViaProxy = Boolean(fallbackUrl)
        && fallbackUrl !== wsUrl
        && fallbackUrl.includes("/ws/");

      if (canRetryViaProxy) {
        this.log("connect:fallback:attempt", {
          failedWsUrl: wsUrl,
          fallbackUrl,
          reason: error?.message || String(error),
        });

        try {
          this.disconnectRoomClient();
          this.roomClient = new Room({ adaptiveStream: true, dynacast: true });
          this.bindRoomEvents();

          this.state = {
            ...this.state,
            connectionState: "Connecting",
            wsConnected: false,
          };
          this.emitAll();

          await traceAwait(
            "connect:room-connect:fallback",
            () => this.roomClient.connect(fallbackUrl, token),
            this.log.bind(this),
          );

          this.state = {
            ...this.state,
            wsConnected: true,
            connectionState: normalizeConnection(this.roomClient.state),
            lastError: "",
          };
          this.log("connect:fallback:success", { fallbackUrl, connectionState: this.state.connectionState });
          return;
        } catch (fallbackError) {
          this.log("connect:fallback:error", {
            fallbackUrl,
            message: fallbackError?.message || String(fallbackError),
            stack: fallbackError?.stack || null,
          });
          error = fallbackError;
        }
      }

      this.log("pipeline:step6:room-connect-rejected", {
        attemptId,
        message: error?.message || String(error),
      });
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
      this.bumpCameraTrackVersion();
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
      if (normalizedState === "Connected") {
        this.log("pipeline:step7:connected-event", {
          attemptId: this.currentJoinAttemptId || this.lastJoinAttemptId || "unknown",
          rawState: state,
        });
      }
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
      this.log("pipeline:step7:disconnected-event", {
        attemptId: this.currentJoinAttemptId || this.lastJoinAttemptId || "unknown",
        message: args.find((item) => item instanceof Error)?.message || null,
      });
      const disconnectError = args.find((item) => item instanceof Error) || null;
      const expectedByUserAction = this.intentionalDisconnect && isExpectedDisconnectMessage(disconnectError);
      if (this.localTracks.camera) {
        try {
          this.localTracks.camera.stop();
        } catch {
          // best effort
        }
        this.localTracks.camera = null;
        this.bumpCameraTrackVersion();
      }

      if (this.localTracks.microphone) {
        try {
          this.localTracks.microphone.stop();
        } catch {
          // best effort
        }
        this.localTracks.microphone = null;
      }

      this.state = {
        ...this.state,
        wsConnected: false,
        connectionState: "Offline",
        cameraEnabled: false,
        cameraTrackVersion: 0,
        microphoneEnabled: false,
        lastError: expectedByUserAction ? "" : (disconnectError?.message || this.state.lastError || ""),
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
          cameraFacingMode: this.state.cameraFacingMode,
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

    const localCameraEnabled = Boolean(this.localTracks.camera);
    const localMicrophoneEnabled = Boolean(this.localTracks.microphone);

    return {
      key: participant.sid || participant.identity,
      participantId: participant.sid || participant.identity,
      identity: participant.identity,
      role: isLocal ? this.state.participantRole || "reporter" : "remote",
      connectionStatus: "Connected",
      cameraEnabled: isLocal ? localCameraEnabled : Boolean(videoPublication && !videoPublication.isMuted),
      microphoneEnabled: isLocal ? localMicrophoneEnabled : Boolean(audioPublication && !audioPublication.isMuted),
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
          room = rooms.find((item) => {
            const candidateName = String(item?.name || item?.roomName || "").toLowerCase();
            return candidateName === String(this.state.roomName || "").toLowerCase();
          }) || null;
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

    const localCameraEnabled = Boolean(this.localTracks.camera);
    const localMicrophoneEnabled = Boolean(this.localTracks.microphone);

    this.state = {
      ...this.state,
      participants,
      cameraEnabled: localParticipant ? Boolean(localParticipant.cameraEnabled) : localCameraEnabled,
      microphoneEnabled: localParticipant ? Boolean(localParticipant.microphoneEnabled) : localMicrophoneEnabled,
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
