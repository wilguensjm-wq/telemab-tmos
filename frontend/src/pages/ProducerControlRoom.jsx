import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, createLocalAudioTrack } from "livekit-client";
import { Link } from "react-router-dom";
import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { producerControlService } from "../services/producerControlService";
import { broadcastEngineService } from "../services/broadcastEngineService";
import { useNotification } from "../hooks/useNotification";
import { useAuth } from "../contexts/AuthContext";
import { useReporterControlRefresh } from "../utils/reporterControlSync";
import { useBackendHealth, SystemStatusBar, SystemAboutModal } from "../components/common/SystemStatus";
import { buildSource } from "../services/sourceModel";
import "../styles/producer-control.css";
import "../styles/system-status.css";

const PENDING_REFRESH_INTERVAL_MS = 2000;
const ROOM_CACHE_PREFIX = "tmos.livekit.roomId:";
const ROOM_ACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;

function isVideoDebugEnabled() {
  try {
    if (typeof window === "undefined") return false;
    const queryEnabled = String(window.location?.search || "").includes("videoDebug=1");
    const storageEnabled = window.localStorage?.getItem("tmos.videoDebug") === "1";
    return queryEnabled || storageEnabled;
  } catch {
    return false;
  }
}

const RUNDOWN_ITEMS = [
  { title: "Opening", duration: "03:00" },
  { title: "Breaking News", duration: "08:00" },
  { title: "Interview", duration: "10:00" },
  { title: "Weather", duration: "05:00" },
  { title: "Sports", duration: "07:00" },
  { title: "Closing", duration: "02:00" },
];

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

function buildSameOriginWsProxyUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/`;
}

function normalizeMonitoringWsUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  const sameOriginProxyUrl = buildSameOriginWsProxyUrl();
  if (!trimmed || typeof window === "undefined" || !window.location) {
    return trimmed || sameOriginProxyUrl;
  }

  try {
    const parsed = new URL(trimmed);
    const isHttpsClient = window.location.protocol === "https:";
    const currentHostWithPort = String(window.location.host || "").toLowerCase();
    const targetHostWithPort = String(parsed.host || "").toLowerCase();

    if (isHttpsClient && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
    }

    const currentHost = String(window.location.hostname || "").toLowerCase();
    const targetHost = String(parsed.hostname || "").toLowerCase();
    const targetIsLoopback = targetHost === "localhost" || targetHost === "127.0.0.1" || targetHost === "::1";
    const currentIsLoopback = currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost === "::1";

    // Rewrite loopback targets whenever host/port does not match the current page.
    // This keeps SSH/port-forwarded and reverse-proxied clients on same-origin /ws/.
    if (targetIsLoopback && (targetHostWithPort !== currentHostWithPort || !currentIsLoopback)) {
      return sameOriginProxyUrl || parsed.toString();
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws/";
    }

    return parsed.toString();
  } catch {
    if (window.location.protocol === "https:" && trimmed.startsWith("ws://")) {
      return `wss://${trimmed.slice(5)}`;
    }
    return trimmed || sameOriginProxyUrl;
  }
}

function formatTime(now) {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(total % 60)).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

function statusToneFromReporter(reporter = {}) {
  const status = normalizeStatus(reporter.status);
  if (status === "live") return "live";
  if (["pending", "waiting", "ready", "online"].includes(status)) return "ready";
  return "offline";
}

function isReporterParticipant(participant) {
  const metadata = parseParticipantMetadata(participant);
  const role = String(metadata?.role || metadata?.participantRole || participant?.participantRole || "").toLowerCase();
  const type = String(metadata?.type || "").toLowerCase();
  const identity = String(participant?.identity || "").toLowerCase();

  const explicitProducer = role === "producer"
    || type.includes("monitor")
    || identity.startsWith("producer-");

  if (explicitProducer) {
    return false;
  }

  // Treat every non-producer remote participant as a source candidate.
  // This prevents transient source drops when track publications or metadata arrive asynchronously.
  return true;
}

function getParticipantFeedState(participant) {
  const videoPublications = Array.from(participant?.videoTrackPublications?.values?.() || []);
  const audioPublications = Array.from(participant?.audioTrackPublications?.values?.() || []);
  const hasVideo = videoPublications.some((publication) => Boolean(publication?.track));
  const hasAudio = audioPublications.some((publication) => Boolean(publication?.track));

  return {
    hasVideo,
    hasAudio,
  };
}

function getParticipantAudioBars(participant) {
  const raw = Number(participant?.audioLevel || 0);
  const level = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  const bars = Math.max(0, Math.min(8, Math.round(level * 8)));
  return "▮".repeat(bars).padEnd(8, "▯");
}

function normalizeLookupToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getParticipantDisplayName(participant) {
  const metadata = parseParticipantMetadata(participant);
  return String(metadata?.reporterName || participant?.name || participant?.identity || "Reporter").trim();
}

function getParticipantDisplayLocation(participant) {
  const metadata = parseParticipantMetadata(participant);
  return String(metadata?.reporterLocation || metadata?.location || "").trim() || "Location not set";
}

function buildVirtualReporterId(participant) {
  return `virtual-${String(participant?.sid || participant?.identity || Date.now())}`;
}

function getParticipantStableKey(participant) {
  const metadata = parseParticipantMetadata(participant);
  const fallbackComposite = [
    participant?.name || "",
    participant?.joinedAt || "",
  ].join("::");

  return String(
    participant?.sid
    || participant?.identity
    || metadata?.participantIdentity
    || metadata?.providerParticipantId
    || metadata?.participantSessionId
    || fallbackComposite,
  ).trim();
}

function getParticipantLogLabel(participant) {
  const metadata = parseParticipantMetadata(participant);
  return String(
    metadata?.reporterName
    || participant?.name
    || participant?.identity
    || participant?.sid
    || "unknown",
  ).trim();
}

function formatLogTimestamp(value = Date.now()) {
  return new Date(value).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function findReporterParticipant(reporters = [], participant) {
  const metadata = parseParticipantMetadata(participant);
  const metadataReporterId = String(metadata?.reporterId || "").trim();

  if (metadataReporterId) {
    const byId = reporters.find((item) => String(item.id) === metadataReporterId);
    if (byId) return byId;
  }

  const normalizedName = normalizeLookupToken(metadata?.reporterName || participant?.name || participant?.identity || "");
  if (!normalizedName) {
    return null;
  }

  const direct = reporters.find((item) => normalizeLookupToken(item.fullName || "") === normalizedName);
  if (direct) {
    return direct;
  }

  return reporters.find((item) => {
    const candidate = normalizeLookupToken(item.fullName || "");
    return candidate && (candidate.includes(normalizedName) || normalizedName.includes(candidate));
  }) || null;
}

function inferSignal(participant) {
  const quality = String(participant?.networkQuality || "").toLowerCase();
  if (quality.includes("excellent") || quality.includes("good")) return "Excellent";
  if (quality.includes("fair")) return "Fair";
  if (quality.includes("poor")) return "Poor";
  return "Unknown";
}

function normalizeSourceTypeToken(rawType = "") {
  const token = String(rawType || "").trim().toLowerCase();
  if (!token) return "reporter";
  if (token.includes("studio")) return "studio-camera";
  if (token.includes("ptz")) return "ptz-camera";
  if (token.includes("obs")) return "obs";
  if (token.includes("ndi")) return "ndi";
  if (token.includes("srt")) return "srt";
  if (token.includes("guest")) return "remote-guest";
  if (token.includes("field") || token.includes("raspberry") || token.includes("rpi")) return "field-unit";
  return "reporter";
}

function sourceTypeLabel(typeToken = "reporter") {
  switch (typeToken) {
    case "studio-camera": return "Studio Camera";
    case "ptz-camera": return "PTZ Camera";
    case "obs": return "OBS Feed";
    case "ndi": return "NDI Feed";
    case "srt": return "SRT Feed";
    case "remote-guest": return "Remote Guest";
    case "field-unit": return "Field Unit";
    default: return "Reporter";
  }
}

function inferSourceTypeFromParticipant(participant, fallbackType = "reporter") {
  const metadata = parseParticipantMetadata(participant);
  const rawType = metadata?.sourceType || metadata?.type || fallbackType;
  return normalizeSourceTypeToken(rawType);
}

function reporterSortScore(reporter) {
  let score = 0;
  if (reporter?.participant) score += 100;
  if (reporter?.cameraReady) score += 20;
  if (reporter?.microphoneReady) score += 10;

  const status = normalizeStatus(reporter?.status);
  if (status === "live") score += 8;
  else if (status === "waiting" || status === "ready" || status === "online") score += 4;

  if (!reporter?.participant && reporter?.isVirtual) score -= 30;
  return score;
}

function isReporterApproved(reporter = {}) {
  return Boolean(reporter?.isVirtual) || normalizeStatus(reporter?.status) === "live";
}

function getReporterReadyStatus(reporter = {}) {
  if (!reporter?.participant) return "Offline";
  if (!isReporterApproved(reporter)) return "Awaiting approval";
  if (!reporter?.cameraReady) return "Awaiting camera";
  if (!reporter?.microphoneReady) return "Video only";
  return "Ready";
}

function getReporterSourceStatusTone(reporter = {}) {
  const readyStatus = getReporterReadyStatus(reporter).toLowerCase();
  if (readyStatus === "ready") return "ready";
  if (readyStatus.includes("approval") || readyStatus.includes("awaiting")) return "pending";
  return "offline";
}

function ParticipantThumbnail({ participant, className = "", placeholder = "No incoming video" }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  const debugCountersRef = useRef({ renders: 0, attach: 0, detach: 0, replace: 0 });
  const debugEnabled = useMemo(() => isVideoDebugEnabled(), []);

  debugCountersRef.current.renders += 1;

  const logVideoDebug = (event, extra = {}) => {
    if (!debugEnabled) return;
    const counters = debugCountersRef.current;
    console.info("[ProducerVideoDebug:Tile]", {
      event,
      participantSid: participant?.sid || "unknown",
      trackIdentity: participant?.identity || "unknown",
      counters,
      ...extra,
    });
  };

  useEffect(() => {
    const videoElement = videoRef.current;
    const publication = Array.from(participant?.videoTrackPublications?.values?.() || []).find((item) => Boolean(item?.track));
    const track = publication?.track || null;

    const eventHandlers = {
      loadedmetadata: () => logVideoDebug("loadedmetadata"),
      playing: () => logVideoDebug("playing"),
      pause: () => logVideoDebug("pause"),
      ended: () => logVideoDebug("ended"),
      resize: () => logVideoDebug("resize"),
    };

    if (videoElement) {
      Object.entries(eventHandlers).forEach(([event, handler]) => videoElement.addEventListener(event, handler));
    }

    if (!videoElement || !track) {
      if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
      }
      setHasVideo(false);
      return () => {
        if (videoElement) {
          Object.entries(eventHandlers).forEach(([event, handler]) => videoElement.removeEventListener(event, handler));
        }
      };
    }

    debugCountersRef.current.attach += 1;
    logVideoDebug("attach", {
      attachCount: debugCountersRef.current.attach,
      mediaTrackId: track.mediaStreamTrack?.id || "unknown",
    });

    track.attach(videoElement);
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.autoplay = true;
    videoElement.play().then(() => {
      setHasVideo(true);
    }).catch(() => {
      setHasVideo(Boolean(videoElement.srcObject));
    });

    return () => {
      debugCountersRef.current.detach += 1;
      logVideoDebug("detach", {
        detachCount: debugCountersRef.current.detach,
        mediaTrackId: track.mediaStreamTrack?.id || "unknown",
      });
      track.detach(videoElement);
      videoElement.pause();
      videoElement.srcObject = null;
      setHasVideo(false);

      if (videoElement) {
        Object.entries(eventHandlers).forEach(([event, handler]) => videoElement.removeEventListener(event, handler));
      }
    };
  }, [participant]);

  return (
    <div className={`source-thumbnail-shell ${className}`.trim()}>
      <video ref={videoRef} className="source-thumbnail-video" />
      {!hasVideo ? <div className="source-thumbnail-placeholder">{placeholder}</div> : null}
    </div>
  );
}

function MultiviewTile({ source, isOnProgram, isInPreview, onClick }) {
  const cls = [
    "multiview-tile",
    isOnProgram ? "on-program" : "",
    isInPreview && !isOnProgram ? "in-preview" : "",
    !source.participant ? "is-offline" : "",
  ].filter(Boolean).join(" ");

  const statusLabel = isOnProgram ? "ON AIR" : isInPreview ? "PREVIEW" : source.participant ? "READY" : "OFFLINE";
  const statusCls = isOnProgram ? "badge-program" : isInPreview ? "badge-preview" : source.participant ? "badge-ready" : "badge-offline";

  const joinTime = source.participant?.joinedAt
    ? new Date(source.participant.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
    : null;

  return (
    <article
      className={cls}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      aria-label={`Load ${source.fullName || source.name || "source"} into Preview`}
    >
      <div className="multiview-tile-video">
        <ParticipantThumbnail
          participant={source.participant}
          placeholder={source.participant ? "Starting..." : "Disconnected"}
        />
        <div className="multiview-overlay-top">
          <div className="multiview-overlay-identity">
            <span className="multiview-tile-name">{source.fullName || source.name || "Unknown Source"}</span>
            <span className="multiview-tile-location">{source.location || "Location not set"}</span>
          </div>
          <span className={`multiview-status-badge ${statusCls}`}>{statusLabel}</span>
        </div>
        <div className="multiview-overlay-bottom">
          <span className="multiview-chip">{sourceTypeLabel(source.type)}</span>
          <span className="multiview-chip">{source.signal || "Unknown"}</span>
          {joinTime ? <span className="multiview-chip">{joinTime}</span> : null}
        </div>
      </div>
    </article>
  );
}

export default function ProducerControlRoom({ cleanMode = false }) {
  const notification = useNotification();
  const { user } = useAuth();
  const systemHealth = useBackendHealth();
  const [showAbout, setShowAbout] = useState(false);

  const [now, setNow] = useState(new Date());
  const [reporters, setReporters] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedReporterId, setSelectedReporterId] = useState(null);
  const [liveReporterId, setLiveReporterId] = useState(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [returnFeedEnabled, setReturnFeedEnabled] = useState(false);
  const [talkbackMicEnabled, setTalkbackMicEnabled] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [engineStatus, setEngineStatus] = useState(null);
  const [pageError, setPageError] = useState("");
  const [mixerBySourceId, setMixerBySourceId] = useState({});
  const [onAirStartedAt, setOnAirStartedAt] = useState(null);

  const roomRef = useRef(null);
  const joinedParticipantIdRef = useRef(null);
  const previewVideoRef = useRef(null);
  const outputVideoRef = useRef(null);
  const monitorAudioRef = useRef(null);
  const producerTalkbackTrackRef = useRef(null);
  const attachRegistryRef = useRef({ preview: null, output: null });
  const isConnectingRef = useRef(false);
  const multiviewEventRef = useRef({ label: "Sync", at: Date.now() });
  const multiviewSignatureRef = useRef("");
  const videoDebugEnabled = useMemo(() => isVideoDebugEnabled(), []);
  const debugCountersRef = useRef({
    renders: 0,
    previewAttach: 0,
    previewDetach: 0,
    outputAttach: 0,
    outputDetach: 0,
    monitorAttach: 0,
    monitorDetach: 0,
    trackReplacement: 0,
  });

  debugCountersRef.current.renders += 1;

  const logVideoDebug = (event, extra = {}) => {
    if (!videoDebugEnabled) return;
    console.info("[ProducerVideoDebug]", {
      event,
      counters: debugCountersRef.current,
      ...extra,
    });
  };

  const refreshReporters = async () => {
    const list = await producerControlService.listRequests();
    setReporters(Array.isArray(list) ? list : []);
  };

  const refreshPendingRequests = async () => {
    const list = await producerControlService.getPendingReporters();
    setPendingRequests(Array.isArray(list) ? list : []);
  };

  const refreshEngineStatus = async () => {
    const status = await broadcastEngineService.getStatus();
    setEngineStatus(status || null);
    setIsRecording(String(status?.recordingStatus || "").toLowerCase() === "recording");
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const cleanupMonitoringConnection = () => {
      if (producerTalkbackTrackRef.current) {
        const talkbackTrack = producerTalkbackTrackRef.current;
        if (roomRef.current?.localParticipant) {
          roomRef.current.localParticipant.unpublishTrack(talkbackTrack).catch(() => {});
        }
        try {
          talkbackTrack.stop();
        } catch {
          // Ignore talkback track stop failures during cleanup.
        }
        producerTalkbackTrackRef.current = null;
        setTalkbackMicEnabled(false);
      }

      const participantId = joinedParticipantIdRef.current;
      if (participantId) {
        APIClient.post(`${API_CONFIG.endpoints.media.leaveSession}/${participantId}/leave`, {}).catch(() => {});
        joinedParticipantIdRef.current = null;
      }

      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };

    const connectMonitoringRoom = async () => {
      if (!mounted || isConnectingRef.current) {
        return;
      }

      // Keep an active monitor session intact; only rebuild when no healthy connection exists.
      if (roomRef.current) {
        const currentState = String(roomRef.current.state || "").toLowerCase();
        if (currentState === "connected" || currentState === "reconnecting") {
          setRoomConnected(true);
          return;
        }
      }

      isConnectingRef.current = true;
      try {
        setPageError("");

        if (roomRef.current || joinedParticipantIdRef.current) {
          cleanupMonitoringConnection();
        }

        const roomListResponse = await APIClient.get(API_CONFIG.endpoints.media.rooms);
        const rooms = roomListResponse?.data?.data || [];
        const roomCacheKey = `${ROOM_CACHE_PREFIX}tmos-live-sources`;

        let cachedRoomId = "";
        try {
          cachedRoomId = String(window?.localStorage?.getItem(roomCacheKey) || "").trim();
        } catch {
          cachedRoomId = "";
        }

        const preferredRoom = resolvePreferredRoomByName(rooms, "tmos-live-sources");
        const cachedRoom = cachedRoomId
          ? (Array.isArray(rooms) ? rooms : []).find((roomEntry) => String(roomEntry?.id || "").trim() === cachedRoomId) || null
          : null;
        const existingRoom = cachedRoom || preferredRoom;

        let room = existingRoom || null;
        if (!room) {
          const createRoomResponse = await APIClient.post(API_CONFIG.endpoints.media.rooms, {
            providerKey: "livekit",
            roomName: "tmos-live-sources",
            roomType: "control-room",
            metadata: { module: "producer-simple-dashboard" },
          });
          room = createRoomResponse?.data?.data || createRoomResponse?.data;
        }

        try {
          if (room?.id) {
            window?.localStorage?.setItem(roomCacheKey, String(room.id));
          }
        } catch {
          // Ignore localStorage failures.
        }

        if (!room?.id) {
          throw new Error("Failed to resolve live room.");
        }

        const joinResponse = await APIClient.post(API_CONFIG.endpoints.media.joinSession, {
          roomId: room.id,
          participantIdentity: `producer-simple-${Date.now()}`,
          participantRole: "producer",
          metadata: { role: "producer", type: "monitor" },
        });

        const joinPayload = joinResponse?.data?.data || joinResponse?.data;
        joinedParticipantIdRef.current = joinPayload?.participant?.id || null;
        const connectionDetails = joinPayload?.connectionDetails || joinPayload;

        if (!connectionDetails?.wsUrl || !connectionDetails?.token) {
          throw new Error("Missing LiveKit connection details.");
        }

        const wsUrl = normalizeMonitoringWsUrl(connectionDetails.wsUrl);
        const token = String(connectionDetails.token || "").trim();

        const roomClient = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = roomClient;

        const markMultiviewEvent = (action, participant = null) => {
          const participantLabel = getParticipantLogLabel(participant);
          multiviewEventRef.current = {
            label: participant ? `${action}: ${participantLabel}` : action,
            at: Date.now(),
          };
        };

        let refreshScheduled = false;
        const refreshQueuesSoon = () => {
          if (refreshScheduled) return;
          refreshScheduled = true;
          setTimeout(() => {
            refreshScheduled = false;
            refreshReporters().catch(() => {});
            refreshPendingRequests().catch(() => {});
          }, 250);
        };

        const syncParticipants = () => {
          if (!mounted) return;
          const remote = Array.from(roomClient.remoteParticipants.values()).filter(isReporterParticipant);
          setParticipants(remote);
          setRoomConnected(true);
          refreshQueuesSoon();
        };

        roomClient.on(RoomEvent.ParticipantConnected, (participant) => {
          markMultiviewEvent("Join", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.ParticipantDisconnected, (participant) => {
          markMultiviewEvent("Leave", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackPublished, (_publication, participant) => {
          markMultiviewEvent("TrackPublished", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackUnpublished, (_publication, participant) => {
          markMultiviewEvent("TrackUnpublished", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackSubscribed, (_track, _publication, participant) => {
          markMultiviewEvent("TrackSubscribed", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
          markMultiviewEvent("TrackUnsubscribed", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackMuted, (_publication, participant) => {
          markMultiviewEvent("TrackMuted", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
          markMultiviewEvent("TrackUnmuted", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.ParticipantMetadataChanged, (_prevMetadata, participant) => {
          markMultiviewEvent("MetadataChanged", participant);
          syncParticipants();
        });
        roomClient.on(RoomEvent.Reconnected, () => {
          if (!mounted) return;
          setPageError("");
          markMultiviewEvent("Reconnected");
          syncParticipants();
        });
        roomClient.on(RoomEvent.Disconnected, () => {
          if (!mounted) return;
          setRoomConnected(false);
          setPageError("LiveKit monitoring disconnected. Reconnecting...");
        });

        await roomClient.connect(wsUrl, token, { autoSubscribe: true });
        markMultiviewEvent("Connected");
        syncParticipants();
      } catch (error) {
        if (mounted) {
          setPageError(error.message || "Failed to connect monitoring room.");
          setRoomConnected(false);
        }
      } finally {
        isConnectingRef.current = false;
      }
    };

    const boot = async () => {
      try {
        await Promise.all([refreshReporters(), refreshPendingRequests(), refreshEngineStatus()]);
      } catch (error) {
        if (mounted) {
          setPageError(error.message || "Failed to load dashboard data.");
        }
      }
      await connectMonitoringRoom();
    };

    boot();

    const intervalId = setInterval(() => {
      refreshReporters().catch(() => {});
      refreshEngineStatus().catch(() => {});

      const roomState = String(roomRef.current?.state || "").toLowerCase();
      if (!roomRef.current || roomState === "disconnected") {
        connectMonitoringRoom().catch(() => {});
      }
    }, 5000);

    const pendingIntervalId = setInterval(() => {
      refreshPendingRequests().catch(() => {});
    }, PENDING_REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      clearInterval(pendingIntervalId);

      cleanupMonitoringConnection();
    };
  }, []);

  useReporterControlRefresh(() => {
    refreshReporters().catch(() => {});
    refreshPendingRequests().catch(() => {});
  });

  const participantsByReporterId = useMemo(() => {
    const map = new Map();
    for (const participant of participants) {
      const linkedReporter = findReporterParticipant(reporters, participant);
      if (linkedReporter?.id) {
        const key = String(linkedReporter.id);
        const current = map.get(key) || [];
        current.push(participant);
        map.set(key, current);
      }
    }
    return map;
  }, [participants, reporters]);

  const matchedParticipantKeys = useMemo(() => {
    const keys = new Set();
    for (const group of participantsByReporterId.values()) {
      for (const participant of group) {
        const stableKey = getParticipantStableKey(participant);
        if (stableKey) {
          keys.add(stableKey);
        }
      }
    }
    return keys;
  }, [participantsByReporterId]);

  const unmatchedParticipants = useMemo(() => (
    participants.filter((participant) => {
      const stableKey = getParticipantStableKey(participant);
      return stableKey ? !matchedParticipantKeys.has(stableKey) : true;
    })
  ), [participants, matchedParticipantKeys]);

  const pendingById = useMemo(() => {
    const map = new Map();
    for (const reporter of pendingRequests) {
      map.set(String(reporter.id), reporter);
    }
    return map;
  }, [pendingRequests]);

  const pendingQueue = useMemo(() => {
    const fromPendingEndpoint = pendingRequests.map((reporter) => {
      const participant = (participantsByReporterId.get(String(reporter.id)) || [])[0] || null;
      return {
        ...reporter,
        participant,
      };
    });

    const fallbackFromLiveList = reporters
      .filter((reporter) => {
        const status = normalizeStatus(reporter.status);
        return (status === "pending" || status === "waiting") && !pendingById.has(String(reporter.id));
      })
      .map((reporter) => ({
        ...reporter,
        participant: (participantsByReporterId.get(String(reporter.id)) || [])[0] || null,
      }));

    return [...fromPendingEndpoint, ...fallbackFromLiveList];
  }, [pendingRequests, reporters, pendingById, participantsByReporterId]);

  const virtualReporters = useMemo(() => {
    return unmatchedParticipants.map((participant) => {
      const feed = getParticipantFeedState(participant);
      const baseReporter = {
        id: buildVirtualReporterId(participant),
        isVirtual: true,
        fullName: getParticipantDisplayName(participant),
        location: getParticipantDisplayLocation(participant),
        status: feed.hasVideo ? "ready" : "online",
        participant,
        signal: inferSignal(participant),
        cameraReady: Boolean(feed.hasVideo),
        microphoneReady: Boolean(feed.hasAudio),
      };
      return {
        ...baseReporter,
        sourceType: "Reporter",
        approvalState: "direct",
        readyStatus: getReporterReadyStatus(baseReporter),
        availableForProgram: Boolean(feed.hasVideo),
      };
    });
  }, [unmatchedParticipants]);

  const enrichedReporters = useMemo(() => {
    const linked = reporters.flatMap((reporter) => {
      const linkedParticipants = participantsByReporterId.get(String(reporter.id)) || [];

      if (linkedParticipants.length === 0) {
        return [];
      }

      return linkedParticipants.map((participant, index) => {
        const feed = getParticipantFeedState(participant);
        const participantKey = getParticipantStableKey(participant) || String(index);
        const baseReporter = {
          ...reporter,
          id: `${reporter.id}::${participantKey}`,
          reporterId: reporter.id,
          participant,
          signal: inferSignal(participant),
          cameraReady: Boolean(feed.hasVideo),
          microphoneReady: Boolean(feed.hasAudio),
          isVirtual: false,
        };

        return {
          ...baseReporter,
          sourceType: "Reporter",
          approvalState: isReporterApproved(baseReporter) ? "approved" : "pending",
          readyStatus: getReporterReadyStatus(baseReporter),
          availableForProgram: isReporterApproved(baseReporter) && Boolean(feed.hasVideo),
        };
      });
    });

    return [...linked, ...virtualReporters];
  }, [reporters, participantsByReporterId, virtualReporters]);

  const orderedReporters = useMemo(() => {
    return [...enrichedReporters].sort((a, b) => {
      const joinedAtA = Date.parse(a?.participant?.joinedAt || "") || 0;
      const joinedAtB = Date.parse(b?.participant?.joinedAt || "") || 0;

      if (joinedAtA && joinedAtB && joinedAtA !== joinedAtB) {
        return joinedAtA - joinedAtB;
      }

      if (joinedAtA && !joinedAtB) {
        return -1;
      }

      if (!joinedAtA && joinedAtB) {
        return 1;
      }

      const left = String(a?.reporterId || a?.id || a?.fullName || "").toLowerCase();
      const right = String(b?.reporterId || b?.id || b?.fullName || "").toLowerCase();
      return left.localeCompare(right);
    });
  }, [enrichedReporters]);

  const sourceInventory = useMemo(() => (
    orderedReporters
      .filter((reporter) => Boolean(reporter?.participant))
      .map((reporter) => {
        const sourceTypeToken = inferSourceTypeFromParticipant(reporter.participant, reporter.sourceType);
        const source = buildSource({
          ...reporter,
          name: reporter.fullName,
          type: sourceTypeToken,
          networkQuality: reporter.signal,
        }, selectedReporterId, liveReporterId);

        return {
          ...reporter,
          ...source,
          fullName: source.name,
          location: source.location || reporter.location,
          microphoneReady: source.audioReady,
          sourceType: sourceTypeLabel(sourceTypeToken),
          readyStatus: source.status === "program"
            ? "ON AIR"
            : source.status === "preview"
              ? "PREVIEW"
              : reporter.readyStatus,
        };
      })
  ), [orderedReporters, selectedReporterId, liveReporterId]);

  useEffect(() => {
    const liveKitParticipants = participants.length;
    const producerSources = sourceInventory.length;
    const renderedTiles = sourceInventory.length;
    const participantKeys = participants.map((participant) => getParticipantStableKey(participant)).filter(Boolean);
    const sourceParticipantKeys = sourceInventory
      .map((source) => getParticipantStableKey(source?.participant))
      .filter(Boolean);

    const signature = JSON.stringify({
      participantKeys: [...participantKeys].sort(),
      sourceParticipantKeys: [...sourceParticipantKeys].sort(),
      liveKitParticipants,
      producerSources,
      renderedTiles,
    });

    if (multiviewSignatureRef.current === signature) {
      return;
    }
    multiviewSignatureRef.current = signature;

    const logEvent = multiviewEventRef.current || { label: "Sync", at: Date.now() };
    const stamp = formatLogTimestamp(logEvent.at);

    console.info("[ProducerMultiviewCounts]");
    console.info(`${stamp}  ${logEvent.label}`);
    console.info(`LiveKit Participants: ${liveKitParticipants}`);
    console.info(`Producer Sources: ${producerSources}`);
    console.info(`Rendered Tiles: ${renderedTiles}`);
    console.info(`Participants=${liveKitParticipants} Sources=${producerSources} Tiles=${renderedTiles}`);

    if (!(liveKitParticipants === producerSources && producerSources === renderedTiles)) {
      const participantKeySet = new Set(participantKeys);
      const sourceKeySet = new Set(sourceParticipantKeys);
      const droppedFromSources = participantKeys.filter((key) => !sourceKeySet.has(key));
      const extraInSources = sourceParticipantKeys.filter((key) => !participantKeySet.has(key));

      console.error("[ProducerMultiviewCounts:MISMATCH]", {
        at: stamp,
        event: logEvent.label,
        liveKitParticipants,
        producerSources,
        renderedTiles,
        droppedFromSources,
        extraInSources,
        participantKeys,
        sourceParticipantKeys,
      });
    }
  }, [participants, sourceInventory]);

  useEffect(() => {
    setMixerBySourceId((prev) => {
      const next = { ...prev };
      for (const source of sourceInventory) {
        const key = String(source.id);
        if (!next[key]) {
          next[key] = { mute: false, solo: false, volume: 1 };
        }
      }
      return next;
    });
  }, [sourceInventory]);

  const selectedReporter = useMemo(
    () => sourceInventory.find((item) => String(item.id) === String(selectedReporterId)) || null,
    [sourceInventory, selectedReporterId],
  );

  const selectedParticipant = selectedReporter?.participant
    || null;

  const liveReporter = useMemo(
    () => sourceInventory.find((item) => String(item.id) === String(liveReporterId)) || null,
    [sourceInventory, liveReporterId],
  );

  const liveParticipant = liveReporter?.participant
    || null;

  const soloSourceId = useMemo(() => {
    for (const [sourceId, state] of Object.entries(mixerBySourceId || {})) {
      if (state?.solo) {
        return sourceId;
      }
    }
    return null;
  }, [mixerBySourceId]);

  useEffect(() => {
    if (sourceInventory.length === 0) {
      if (selectedReporterId !== null) {
        setSelectedReporterId(null);
      }
      return;
    }

    if (!selectedReporterId) {
      return;
    }

    const selectedStillPresent = sourceInventory.some((source) => String(source.id) === String(selectedReporterId));
    if (!selectedStillPresent) {
      setSelectedReporterId(null);
      notification.info("Preview source disconnected. Select another source.");
    }
  }, [sourceInventory, selectedReporterId, notification]);

  // Preview effect — independent of program so program never flickers on source selection change.
  useEffect(() => {
    const previewEl = previewVideoRef.current;
    const eventHandlers = {
      loadedmetadata: () => logVideoDebug("preview.loadedmetadata"),
      playing: () => logVideoDebug("preview.playing"),
      pause: () => logVideoDebug("preview.pause"),
      ended: () => logVideoDebug("preview.ended"),
      resize: () => logVideoDebug("preview.resize"),
    };

    if (previewEl) {
      Object.entries(eventHandlers).forEach(([event, handler]) => previewEl.addEventListener(event, handler));
    }

    const detach = () => {
      const track = attachRegistryRef.current.preview;
      if (track) {
        debugCountersRef.current.previewDetach += 1;
        logVideoDebug("preview.detach", {
          mediaTrackId: track.mediaStreamTrack?.id || "unknown",
          detachCount: debugCountersRef.current.previewDetach,
        });
        track.detach(previewEl);
        attachRegistryRef.current.preview = null;
      }
      if (previewEl) previewEl.srcObject = null;
    };

    detach();

    if (selectedParticipant && previewEl) {
      const publication = Array.from(selectedParticipant.videoTrackPublications.values()).find((p) => Boolean(p?.track));
      const track = publication?.track;
      if (track) {
        debugCountersRef.current.previewAttach += 1;
        if (attachRegistryRef.current.preview && attachRegistryRef.current.preview !== track) {
          debugCountersRef.current.trackReplacement += 1;
          logVideoDebug("preview.track-replacement", {
            replacementCount: debugCountersRef.current.trackReplacement,
          });
        }
        logVideoDebug("preview.attach", {
          mediaTrackId: track.mediaStreamTrack?.id || "unknown",
          attachCount: debugCountersRef.current.previewAttach,
          participantSid: selectedParticipant?.sid || "unknown",
        });
        track.attach(previewEl);
        previewEl.muted = true;
        previewEl.playsInline = true;
        previewEl.autoplay = true;
        previewEl.play().catch(() => {});
        attachRegistryRef.current.preview = track;
      }
    }

    return () => {
      detach();
      if (previewEl) {
        Object.entries(eventHandlers).forEach(([event, handler]) => previewEl.removeEventListener(event, handler));
      }
    };
  }, [selectedParticipant]);

  // Program effect — only re-runs when the live (on-air) source changes.
  useEffect(() => {
    const outputEl = outputVideoRef.current;
    const eventHandlers = {
      loadedmetadata: () => logVideoDebug("program.loadedmetadata"),
      playing: () => logVideoDebug("program.playing"),
      pause: () => logVideoDebug("program.pause"),
      ended: () => logVideoDebug("program.ended"),
      resize: () => logVideoDebug("program.resize"),
    };

    if (outputEl) {
      Object.entries(eventHandlers).forEach(([event, handler]) => outputEl.addEventListener(event, handler));
    }

    const detach = () => {
      const track = attachRegistryRef.current.output;
      if (track) {
        debugCountersRef.current.outputDetach += 1;
        logVideoDebug("program.detach", {
          mediaTrackId: track.mediaStreamTrack?.id || "unknown",
          detachCount: debugCountersRef.current.outputDetach,
        });
        track.detach(outputEl);
        attachRegistryRef.current.output = null;
      }
      if (outputEl) outputEl.srcObject = null;
    };

    detach();

    if (liveParticipant && outputEl) {
      const publication = Array.from(liveParticipant.videoTrackPublications.values()).find((p) => Boolean(p?.track));
      const track = publication?.track;
      if (track) {
        debugCountersRef.current.outputAttach += 1;
        if (attachRegistryRef.current.output && attachRegistryRef.current.output !== track) {
          debugCountersRef.current.trackReplacement += 1;
          logVideoDebug("program.track-replacement", {
            replacementCount: debugCountersRef.current.trackReplacement,
          });
        }
        logVideoDebug("program.attach", {
          mediaTrackId: track.mediaStreamTrack?.id || "unknown",
          attachCount: debugCountersRef.current.outputAttach,
          participantSid: liveParticipant?.sid || "unknown",
        });
        track.attach(outputEl);
        outputEl.muted = true;
        outputEl.playsInline = true;
        outputEl.autoplay = true;
        outputEl.play().catch(() => {});
        attachRegistryRef.current.output = track;
      }
    }

    return () => {
      detach();
      if (outputEl) {
        Object.entries(eventHandlers).forEach(([event, handler]) => outputEl.removeEventListener(event, handler));
      }
    };
  }, [liveParticipant]);

  // Producer audio monitor follows Preview first, then falls back to ON AIR source.
  useEffect(() => {
    const monitorEl = monitorAudioRef.current;
    let currentTrack = null;

    const detach = () => {
      if (currentTrack && monitorEl) {
        debugCountersRef.current.monitorDetach += 1;
        logVideoDebug("monitor.detach", {
          mediaTrackId: currentTrack.mediaStreamTrack?.id || "unknown",
          detachCount: debugCountersRef.current.monitorDetach,
        });
        currentTrack.detach(monitorEl);
      }
      if (monitorEl) {
        monitorEl.pause();
        monitorEl.srcObject = null;
      }
      currentTrack = null;
    };

    detach();

    if (!monitorEl) {
      return detach;
    }

    const soloSource = soloSourceId
      ? sourceInventory.find((source) => String(source.id) === String(soloSourceId)) || null
      : null;

    const candidate = soloSource?.participant || selectedParticipant || liveParticipant;
    if (!candidate) {
      return detach;
    }

    const publication = Array.from(candidate.audioTrackPublications.values())
      .find((item) => Boolean(item?.track && !item?.isMuted))
      || Array.from(candidate.audioTrackPublications.values()).find((item) => Boolean(item?.track));

    const track = publication?.track || null;
    if (!track) {
      return detach;
    }

    const candidateSource = sourceInventory.find((source) => source.participant?.sid === candidate?.sid) || null;
    const candidateMixer = candidateSource ? mixerBySourceId[String(candidateSource.id)] : null;

    debugCountersRef.current.monitorAttach += 1;
    logVideoDebug("monitor.attach", {
      mediaTrackId: track.mediaStreamTrack?.id || "unknown",
      attachCount: debugCountersRef.current.monitorAttach,
      participantSid: candidate?.sid || "unknown",
    });

    track.attach(monitorEl);
    monitorEl.muted = Boolean(candidateMixer?.mute);
    monitorEl.volume = Math.max(0, Math.min(1, Number(candidateMixer?.volume ?? 1)));
    monitorEl.autoplay = true;
    monitorEl.playsInline = true;
    monitorEl.play().catch(() => {});
    currentTrack = track;

    return detach;
  }, [selectedParticipant, liveParticipant, sourceInventory, soloSourceId, mixerBySourceId]);

  useEffect(() => {
    if (!liveReporterId) {
      setOnAirStartedAt(null);
      return;
    }

    setOnAirStartedAt((prev) => prev || Date.now());
  }, [liveReporterId]);

  const selectReporter = (source) => {
    setSelectedReporterId(source.id);
    if (!source.participant) {
      notification.warning("Source is disconnected and cannot be previewed.");
    }
  };

  const updateMixerSource = (sourceId, updater) => {
    const key = String(sourceId);
    setMixerBySourceId((prev) => {
      const current = prev[key] || { mute: false, solo: false, volume: 1 };
      return {
        ...prev,
        [key]: updater(current),
      };
    });
  };

  const toggleSourceMute = (sourceId) => {
    updateMixerSource(sourceId, (current) => ({ ...current, mute: !current.mute }));
  };

  const toggleSourceSolo = (sourceId) => {
    const key = String(sourceId);
    setMixerBySourceId((prev) => {
      const isAlreadySolo = Boolean(prev[key]?.solo);
      const next = {};

      for (const [id, state] of Object.entries(prev)) {
        next[id] = { ...state, solo: false };
      }

      if (!isAlreadySolo) {
        const current = next[key] || { mute: false, solo: false, volume: 1 };
        next[key] = { ...current, solo: true };
      }

      return next;
    });
  };

  const setSourceVolume = (sourceId, value) => {
    const normalized = Math.max(0, Math.min(1, Number(value)));
    updateMixerSource(sourceId, (current) => ({ ...current, volume: normalized }));
  };

  const handleQueuePreview = (reporter) => {
    if (!reporter?.id || !reporter?.participant) {
      notification.warning("Source is not publishing live video yet.");
      return;
    }

    const matchingSource = sourceInventory.find((source) => (
      source.participant?.sid && reporter.participant?.sid
        ? source.participant.sid === reporter.participant.sid
        : false
    )) || sourceInventory.find((source) => String(source.reporterId || "") === String(reporter.id));

    if (matchingSource?.id) {
      setSelectedReporterId(matchingSource.id);
    }

    notification.info(`${reporter.fullName || "Source"} loaded into Preview.`);
  };

  const handleApprovePending = async (reporter) => {
    if (!reporter?.id || isBusy) return;

    setIsBusy(true);
    try {
      await producerControlService.approveRequest(reporter.id);
      notification.success(`${reporter.fullName || "Reporter"} approved.`);
      await Promise.all([refreshReporters(), refreshPendingRequests()]);
    } catch (error) {
      notification.error(error.message || "Approve failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRejectPending = async (reporter) => {
    if (!reporter?.id || isBusy) return;

    setIsBusy(true);
    try {
      await producerControlService.rejectRequest(reporter.id);
      notification.info(`${reporter.fullName || "Reporter"} rejected.`);
      await Promise.all([refreshReporters(), refreshPendingRequests()]);
    } catch (error) {
      notification.error(error.message || "Reject failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleTake = async () => {
    if (!selectedReporter?.id || !selectedParticipant || isBusy) {
      return;
    }

    if (!selectedReporter.availableForProgram) {
      notification.warning("Approve the reporter and confirm camera is live before taking the source to Program.");
      return;
    }

    setIsBusy(true);
    try {
      await broadcastEngineService.setActiveProgram({ activeProgram: selectedReporter.fullName || "Program standby" });
      setLiveReporterId(selectedReporter.id);
      notification.success(`${selectedReporter.fullName || "Reporter"} is now on program output.`);
      await Promise.all([refreshReporters(), refreshEngineStatus()]);
    } catch (error) {
      notification.error(error.message || "TAKE failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCut = async () => {
    if (!selectedReporter?.id || !selectedParticipant || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await broadcastEngineService.setActiveProgram({ activeProgram: selectedReporter.fullName || "Program standby" });
      setLiveReporterId(selectedReporter.id);
      notification.success(`CUT to ${selectedReporter.fullName || "selected reporter"}.`);
      await refreshEngineStatus();
    } catch (error) {
      notification.error(error.message || "CUT failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleMute = async () => {
    if (!selectedReporter?.id || !selectedParticipant || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await producerControlService.setTalkback({ ...selectedReporter, id: selectedReporter.reporterId || selectedReporter.id }, false);
      notification.info(`Talkback muted for ${selectedReporter.fullName || "reporter"}.`);
    } catch (error) {
      notification.error(error.message || "Mute failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const setProducerTalkbackMic = async (enabled) => {
    const roomClient = roomRef.current;
    if (!roomClient || String(roomClient.state || "").toLowerCase() !== "connected") {
      throw new Error("LiveKit monitoring room is not connected.");
    }

    if (!enabled) {
      const track = producerTalkbackTrackRef.current;
      if (track) {
        try {
          await roomClient.localParticipant.unpublishTrack(track);
        } catch {
          // Ignore unpublish failures and continue local cleanup.
        }
        try {
          track.stop();
        } catch {
          // Ignore stop failures for already-ended tracks.
        }
        producerTalkbackTrackRef.current = null;
      }

      setTalkbackMicEnabled(false);
      return;
    }

    if (producerTalkbackTrackRef.current) {
      setTalkbackMicEnabled(true);
      return;
    }

    const talkbackTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await roomClient.localParticipant.publishTrack(talkbackTrack);
    producerTalkbackTrackRef.current = talkbackTrack;
    setTalkbackMicEnabled(true);
  };

  const handleProducerTalkbackMic = async () => {
    if (isBusy) return;

    setIsBusy(true);
    try {
      const nextEnabled = !talkbackMicEnabled;
      await setProducerTalkbackMic(nextEnabled);
      notification.success(nextEnabled
        ? "Producer talkback microphone enabled."
        : "Producer talkback microphone muted.");
    } catch (error) {
      notification.error(error?.message || "Unable to toggle producer talkback microphone.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleReturnFeed = async () => {
    if (!selectedReporter || !selectedParticipant || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      const nextState = !returnFeedEnabled;
      await producerControlService.setTalkback({ ...selectedReporter, id: selectedReporter.reporterId || selectedReporter.id }, nextState);
      setReturnFeedEnabled(nextState);
      notification.success(nextState
        ? `Return feed enabled for ${selectedReporter.fullName || "reporter"}.`
        : `Return feed disabled for ${selectedReporter.fullName || "reporter"}.`);
    } catch (error) {
      notification.error(error.message || "Return feed action failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRecord = async () => {
    if (isBusy) return;

    setIsBusy(true);
    try {
      if (isRecording) {
        await broadcastEngineService.stopRecording();
        notification.info("Recording stopped.");
      } else {
        await broadcastEngineService.startRecording();
        notification.success("Recording started.");
      }
      await refreshEngineStatus();
    } catch (error) {
      notification.error(error.message || "Record action failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleApproveSelection = async () => {
    if (!selectedReporter?.id || selectedReporter?.isVirtual || isBusy) {
      return;
    }

    const reporterId = selectedReporter.reporterId || selectedReporter.id;

    setIsBusy(true);
    try {
      await producerControlService.approveRequest(reporterId);
      notification.success(`${selectedReporter.fullName || "Reporter"} approved.`);
      await Promise.all([refreshReporters(), refreshPendingRequests()]);
    } catch (error) {
      notification.error(error.message || "Approve failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleEndLive = async () => {
    if (isBusy) return;

    setIsBusy(true);
    try {
      await broadcastEngineService.stopBroadcast();
      setLiveReporterId(null);
      notification.warning("Broadcast stopped.");
      await refreshEngineStatus();
    } catch (error) {
      notification.error(error.message || "End live failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const liveElapsed = formatElapsed(engineStatus?.uptimeSeconds || 0);
  const onAirDuration = onAirStartedAt ? formatElapsed((Date.now() - onAirStartedAt) / 1000) : "00:00:00";
  const selectedFeed = selectedReporter?.fullName || "Select a reporter";
  const outputFeed = liveReporter?.fullName || "Standby";
  const selectedMetadata = parseParticipantMetadata(selectedParticipant);
  const liveMetadata = parseParticipantMetadata(liveParticipant);
  const latencyMs = Number(liveMetadata?.latencyMs || liveParticipant?.latencyMs || 0);
  const bitrateKbps = Number(liveMetadata?.bitrateKbps || liveParticipant?.bitrateKbps || 0);
  const fpsValue = Number(liveMetadata?.fps || liveParticipant?.fps || 30);
  const resolution = String(liveMetadata?.resolution || "1920x1080");
  const qualityToken = String(selectedReporter?.signal || (roomConnected ? "Good" : "Offline"));
  const bitrateMbps = bitrateKbps > 0 ? (bitrateKbps / 1000).toFixed(1) : "n/a";
  const meterLevel = qualityToken.toLowerCase().includes("excellent")
    ? 8
    : qualityToken.toLowerCase().includes("good")
      ? 6
      : qualityToken.toLowerCase().includes("fair")
        ? 4
        : 2;
  const meterDisplay = "▮".repeat(meterLevel).padEnd(8, "▯");

  const handleFullscreenProgram = () => {
    const frame = outputVideoRef.current?.closest(cleanMode ? ".producer-clean-frame" : ".program-monitor-card");
    if (!frame || typeof frame.requestFullscreen !== "function") {
      return;
    }
    frame.requestFullscreen().catch(() => {});
  };

  if (cleanMode) {
    return (
      <div className="producer-clean-shell">
        <div className="producer-clean-frame">
          <video ref={outputVideoRef} />
          {!liveParticipant ? <p className="program-monitor-overlay">No active source on program output</p> : null}
          <div className="producer-clean-overlay">
            <div className="producer-clean-meta">
              <strong>{outputFeed}</strong>
              <span>{resolution}</span>
              <span>{fpsValue > 0 ? `${Math.round(fpsValue)} fps` : "30 fps"}</span>
              <span>{bitrateMbps !== "n/a" ? `${bitrateMbps} Mbps` : "Bitrate n/a"}</span>
            </div>
            <div className="producer-clean-actions">
              <button type="button" className="btn-surface" onClick={handleFullscreenProgram}>Fullscreen</button>
              <Link className="btn-surface producer-clean-link" to="/reporter-control/producer">Control Room</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="producer-broadcast-shell">
      <header className="producer-broadcast-header">
        <div>
          <h1>Producer Switcher</h1>
          <p>Source-driven Preview and Program control for live contribution feeds</p>
        </div>
        <div className="producer-header-pills">
          <span className="producer-pill live">LIVE {liveElapsed}</span>
          <span className="producer-pill">Program: {outputFeed}</span>
          <span className="producer-pill">Clock: {formatTime(now)}</span>
          <span className="producer-pill">Producer: {user?.name || user?.username || "Admin"}</span>
          <SystemStatusBar health={systemHealth} livekitConnected={roomConnected} />
          <button type="button" className="producer-pill build-pill build-chip-btn" onClick={() => setShowAbout(true)}>Build: {__BUILD_VERSION__}</button>
        </div>
      </header>

      {pageError ? <div className="producer-alert">{pageError}</div> : null}

      <audio ref={monitorAudioRef} className="producer-audio-monitor" />

      <section className="producer-main-layout">
        <div className="program-stack">
          <article className={`program-monitor-card${liveParticipant ? " on-air" : ""}`}>
            <div className="program-monitor-head">
              <h2>Program Output</h2>
              <div className="program-monitor-actions">
                <button type="button" className="btn-surface" onClick={handleFullscreenProgram}>Full Screen</button>
                <Link className="btn-surface producer-clean-link" to="/monitor/program">Clean Feed</Link>
                <span className="onair-pill">On Air</span>
              </div>
            </div>
            <div className="program-monitor-frame">
              <video ref={outputVideoRef} />
              {!liveParticipant ? (
                <div className="program-standby-overlay">
                  <span className="standby-label">STANDBY</span>
                  <span className="standby-hint">Select a source → Take Live</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className="preview-monitor-card">
            <div className="program-monitor-head">
              <h2>Preview</h2>
              {selectedReporter ? (
                <div className="preview-source-id">
                  <strong>{selectedReporter.fullName}</strong>
                  {selectedReporter.location ? <span>{selectedReporter.location}</span> : null}
                </div>
              ) : (
                <span className="preview-label">No source selected</span>
              )}
            </div>
            <div className="preview-monitor-frame">
              <video ref={previewVideoRef} />
              {!selectedParticipant ? <p className="program-monitor-overlay">Select a source in Multiview</p> : null}
            </div>
          </article>

          <section className="live-quick-strip">
            <div>
              <span>ON AIR</span>
              <strong>{outputFeed}</strong>
            </div>
            <div>
              <span>PREVIEW</span>
              <strong>{selectedFeed}</strong>
            </div>
            <div>
              <span>DURATION</span>
              <strong>{onAirDuration}</strong>
            </div>
            <div>
              <span>WAITING</span>
              <strong>{pendingQueue.length}</strong>
            </div>
          </section>

          <section className="producer-action-row">
            <button type="button" className="btn-take-live" onClick={handleTake} disabled={isBusy || !selectedReporter || !selectedParticipant || !selectedReporter?.availableForProgram}>Take Live</button>
            <button type="button" className="btn-cut" onClick={handleApproveSelection} disabled={isBusy || !selectedReporter || selectedReporter?.isVirtual || selectedReporter?.approvalState === "approved"}>Approve</button>
            <button type="button" className="btn-record" onClick={handleRecord} disabled={isBusy}>{isRecording ? "Stop Record" : "Record"}</button>
            <button type="button" className="btn-surface" onClick={handleFullscreenProgram}>Fullscreen</button>
          </section>

          {sourceInventory.length > 0 && (
            <section className="multiview-section">
              <div className="panel-topbar">
                <h3>Multiview</h3>
                <span>{sourceInventory.length} {sourceInventory.length === 1 ? "source" : "sources"}</span>
              </div>
              <div className="multiview-grid">
                {sourceInventory.map((source) => (
                  <MultiviewTile
                    key={source.id}
                    source={source}
                    isOnProgram={String(liveReporterId) === String(source.id)}
                    isInPreview={String(selectedReporterId) === String(source.id)}
                    onClick={() => selectReporter(source)}
                  />
                ))}
              </div>
            </section>
          )}

          <details className="producer-advanced-controls">
            <summary>Advanced Controls and Diagnostics</summary>
            <div className="producer-advanced-row">
              <button type="button" className="btn-return-feed" onClick={handleReturnFeed} disabled={isBusy || !selectedReporter || !selectedParticipant}>
                {returnFeedEnabled ? "Return Feed On" : "Return Feed"}
              </button>
              <button type="button" className="btn-return-feed" onClick={handleProducerTalkbackMic} disabled={isBusy || !roomConnected}>
                {talkbackMicEnabled ? "Producer Mic On" : "Producer Mic Off"}
              </button>
              <button type="button" className="btn-cut" onClick={handleCut} disabled={isBusy || !selectedReporter || !selectedParticipant}>Cut</button>
              <button type="button" className="btn-mute" onClick={handleMute} disabled={isBusy || !selectedReporter || !selectedParticipant}>Mute Talkback</button>
              <button type="button" className="btn-end-live" onClick={handleEndLive} disabled={isBusy}>End Broadcast</button>
            </div>
            <p className="advanced-note">Signal: {qualityToken}</p>

            <div className="advanced-grid">
              <section className="producer-card confidence-card">
                <div className="panel-topbar">
                  <h3>ON AIR Confidence</h3>
                  <span className={`confidence-pill ${liveParticipant ? "live" : "standby"}`}>{liveParticipant ? "ON AIR" : "STANDBY"}</span>
                </div>
                <div className="confidence-body">
                  <p className="confidence-name">{liveReporter?.fullName || "No source on air"}</p>
                  <p className="confidence-location">{liveReporter?.location || "--"}</p>
                  <div className="confidence-grid">
                    <div><span>On Air Duration</span><strong>{onAirDuration}</strong></div>
                    <div><span>Connected Since</span><strong>{liveParticipant?.joinedAt ? new Date(liveParticipant.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "--"}</strong></div>
                  </div>
                </div>
              </section>

              <section className="producer-card diagnostics-card">
                <div className="panel-topbar">
                  <h3>Signal Diagnostics</h3>
                </div>
                <div className="telemetry-grid">
                  <div><span>Resolution</span><strong>{resolution}</strong></div>
                  <div><span>FPS</span><strong>{fpsValue > 0 ? `${Math.round(fpsValue)}` : "30"}</strong></div>
                  <div><span>Latency</span><strong>{latencyMs > 0 ? `${latencyMs} ms` : "n/a"}</strong></div>
                  <div><span>Bitrate</span><strong>{bitrateMbps !== "n/a" ? `${bitrateMbps} Mbps` : "n/a"}</strong></div>
                </div>
                <div className="meters-row">
                  <div className="meter-card"><span>Video Meter</span><strong>{meterDisplay}</strong></div>
                  <div className="meter-card"><span>Audio Meter</span><strong>{selectedReporter?.microphoneReady ? meterDisplay : "▯▯▯▯▯▯▯▯"}</strong></div>
                </div>
              </section>

              <section className="producer-card mixer-card">
                <div className="panel-topbar">
                  <h3>Audio Mixer</h3>
                  <span>{sourceInventory.length} channels</span>
                </div>
                <div className="mixer-list">
                  {sourceInventory.length === 0 ? (
                    <p className="empty-copy">No sources available.</p>
                  ) : sourceInventory.map((source) => {
                    const mixer = mixerBySourceId[String(source.id)] || { mute: false, solo: false, volume: 1 };
                    return (
                      <article key={`mix-${source.id}`} className="mixer-row">
                        <div className="mixer-row-head">
                          <strong>{source.fullName || source.name || "Unknown Source"}</strong>
                          <span>{source.readyStatus || "READY"}</span>
                        </div>
                        <div className="mixer-row-meter">{source.microphoneReady ? getParticipantAudioBars(source.participant) : "▯▯▯▯▯▯▯▯"}</div>
                        <div className="mixer-row-controls">
                          <button
                            type="button"
                            className={`mixer-btn ${mixer.mute ? "active" : ""}`}
                            onClick={() => toggleSourceMute(source.id)}
                          >
                            Mute
                          </button>
                          <button
                            type="button"
                            className={`mixer-btn ${mixer.solo ? "active" : ""}`}
                            onClick={() => toggleSourceSolo(source.id)}
                          >
                            Solo
                          </button>
                          <label className="mixer-slider-wrap">
                            <span>Vol</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={mixer.volume}
                              onChange={(event) => setSourceVolume(source.id, event.target.value)}
                            />
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {pendingQueue.length > 0 ? (
                <section className="producer-card approvals-card">
                  <div className="panel-topbar">
                    <h3>Source Approval</h3>
                    <span>{pendingQueue.length} waiting</span>
                  </div>
                  <div className="pending-queue-list">
                    {pendingQueue.map((reporter) => (
                      <article key={`pending-${reporter.id}`} className="pending-queue-card">
                        <div>
                          <h4>{reporter.fullName || "Unknown Reporter"}</h4>
                          <p>{reporter.location || "Location not set"}</p>
                        </div>
                        <div className="pending-queue-actions">
                          <button type="button" className="btn-pending-approve" onClick={() => handleApprovePending(reporter)} disabled={isBusy}>Approve</button>
                          <button type="button" className="btn-pending-reject" onClick={() => handleRejectPending(reporter)} disabled={isBusy}>Reject</button>
                          <button type="button" className="btn-surface" onClick={() => handleQueuePreview(reporter)} disabled={!reporter.participant}>Preview</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </details>
        </div>
      </section>
    </div>
    {showAbout && <SystemAboutModal version={__BUILD_VERSION__} health={systemHealth} livekitConnected={roomConnected} onClose={() => setShowAbout(false)} />}
    </>
  );
}
