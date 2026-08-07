import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import APIClient from "../../api/APIClient";
import { API_CONFIG } from "../../constants/api";
import "../../styles/producer-monitoring.css";

function parseParticipantMetadata(participant) {
  const raw = participant?.metadata;
  if (!raw) {
    return {};
  }

  if (typeof raw === "object") {
    return raw;
  }

  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function isReporterParticipant(participant) {
  const metadata = parseParticipantMetadata(participant);
  const role = String(metadata?.role || participant?.participantRole || "").toLowerCase();
  const type = String(metadata?.type || "").toLowerCase();
  const identity = String(participant?.identity || "").toLowerCase();

  if (role === "reporter") {
    return true;
  }

  if (type.includes("reporter")) {
    return true;
  }

  return identity.startsWith("reporter-");
}

function getParticipantDisplay(participant) {
  const metadata = parseParticipantMetadata(participant);
  const name = String(
    metadata?.reporterName
    || participant?.name
    || participant?.identity
    || "Reporter",
  ).trim();

  const location = String(metadata?.reporterLocation || metadata?.location || "").trim() || "Location not set";
  const role = String(metadata?.role || participant?.participantRole || "reporter").trim() || "reporter";
  return { name, location, role };
}

function getParticipantFeedState(participant) {
  const videoPublications = Array.from(participant?.videoTrackPublications?.values?.() || []);
  const audioPublications = Array.from(participant?.audioTrackPublications?.values?.() || []);
  const hasVideo = videoPublications.some((publication) => Boolean(publication?.track));
  const hasAudio = audioPublications.some((publication) => Boolean(publication?.track));

  return {
    hasVideo,
    hasAudio,
    stateLabel: hasVideo ? "LIVE" : "READY",
  };
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

    // Rewrite only loopback targets for non-loopback clients.
    // Preserve valid remote LiveKit hosts to avoid breaking cross-host producer monitoring.
    if (targetIsLoopback && !currentIsLoopback) {
      return sameOriginProxyUrl || parsed.toString();
    }

    // Normalize same-host root URLs to the proxy websocket path.
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

export function ProducerMonitoring({ roomName = "tmos-live-sources" }) {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const roomRef = useRef(null);
  const joinedParticipantIdRef = useRef(null);
  const containerRef = useRef(null);
  const videoElementsRef = useRef(new Map());

  useEffect(() => {
    let isMounted = true;

    const connectProducerMonitoring = async () => {
      setIsLoading(true);
      setError("");

      try {
        const roomListResponse = await APIClient.get(API_CONFIG.endpoints.media.rooms);
        const rooms = roomListResponse?.data?.data || [];
        const existingRoom = Array.isArray(rooms)
          ? rooms.find((item) => String(item?.name || "").toLowerCase() === String(roomName || "").toLowerCase())
          : null;

        let room = existingRoom || null;
        if (!room) {
          const createRoomResponse = await APIClient.post(API_CONFIG.endpoints.media.rooms, {
            providerKey: "livekit",
            roomName,
            roomType: "control-room",
            metadata: { module: "producer-monitoring" },
          });
          room = createRoomResponse?.data?.data || createRoomResponse?.data;
        }

        if (!room?.id) {
          throw new Error("Failed to get room information");
        }

        // Join as a producer to monitor the room
        const joinResponse = await APIClient.post(
          API_CONFIG.endpoints.media.joinSession,
          {
            roomId: room.id,
            participantIdentity: `producer-monitor-${Date.now()}`,
            participantRole: "producer",
            metadata: { role: "producer", type: "monitor" },
          }
        );

        const joinPayload = joinResponse?.data?.data || joinResponse?.data;
        joinedParticipantIdRef.current = joinPayload?.participant?.id || null;
        const connectionDetails = joinPayload?.connectionDetails || joinPayload;
        
        if (!connectionDetails?.wsUrl || !connectionDetails?.token) {
          throw new Error("Invalid connection details received");
        }

        const token = String(connectionDetails.token || "").trim();
        const wsUrl = normalizeMonitoringWsUrl(connectionDetails.wsUrl);

        // Create and connect to LiveKit room
        const liveKitRoom = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = liveKitRoom;

        // Event handler for new participants
        const handleParticipantConnected = (participant) => {
          if (!isReporterParticipant(participant)) {
            return;
          }

          if (isMounted) {
            setParticipants((current) => {
              const exists = current.some((p) => p.sid === participant.sid);
              return exists ? current : [...current, participant];
            });
          }
        };

        const handleParticipantDisconnected = (participant) => {
          if (isMounted) {
            setParticipants((current) => current.filter((p) => p.sid !== participant.sid));
            // Clean up video element
            videoElementsRef.current.delete(participant.sid);
          }
        };

        // Subscribe to track events
        const handleTrackSubscribed = (track, publication, participant) => {
          if (isMounted && containerRef.current) {
            // Create video element for video tracks
            if (track.kind === "video") {
              const videoElement = document.createElement("video");
              videoElement.autoplay = true;
              videoElement.playsInline = true;
              videoElement.muted = true;
              videoElement.style.width = "100%";
              videoElement.style.height = "100%";
              videoElement.style.objectFit = "cover";

              track.attach(videoElement);
              const videoSlot = document.getElementById(`participant-video-${participant.sid}`);
              if (videoSlot) {
                videoSlot.innerHTML = "";
                videoSlot.appendChild(videoElement);
                videoElementsRef.current.set(participant.sid, videoElement);
              }
            }

            // Audio tracks are handled automatically by the Room
          }
        };

        const handleTrackUnsubscribed = (track) => {
          if (isMounted) {
            track.detach();
          }
        };

        // Bind event listeners
        liveKitRoom.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
        liveKitRoom.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
        liveKitRoom.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
        liveKitRoom.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

        // Connect to room
        await liveKitRoom.connect(wsUrl, token);

        if (isMounted) {
          // Add existing participants
          liveKitRoom.remoteParticipants.forEach((participant) => {
            if (!isReporterParticipant(participant)) {
              return;
            }

            setParticipants((current) => {
              const exists = current.some((p) => p.sid === participant.sid);
              return exists ? current : [...current, participant];
            });
          });

          setIsConnected(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to connect to monitoring room");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    connectProducerMonitoring();

    return () => {
      isMounted = false;
      const participantId = joinedParticipantIdRef.current;
      if (participantId) {
        APIClient.post(`${API_CONFIG.endpoints.media.leaveSession}/${participantId}/leave`, {}).catch(() => {});
        joinedParticipantIdRef.current = null;
      }
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      videoElementsRef.current.forEach((element) => element?.remove?.());
      videoElementsRef.current.clear();
    };
  }, [roomName]);

  if (isLoading) {
    return (
      <div className="producer-monitoring">
        <div className="monitoring-loading">
          <div className="spinner"></div>
          <p>Connecting to LiveKit monitoring room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="producer-monitoring">
        <div className="monitoring-error">
          <p className="error-title">⚠️ Connection Error</p>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="producer-monitoring">
        <div className="monitoring-empty">
          <p>Initializing monitoring connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="producer-monitoring">
      <div className="monitoring-status">
        <div className="status-badge online">
          <span className="status-dot"></span>
          Connected - {participants.length} reporter{participants.length !== 1 ? "s" : ""} online
        </div>
      </div>

      {participants.length === 0 ? (
        <div className="monitoring-empty">
          <p>Awaiting reporter connections with live video/audio...</p>
        </div>
      ) : (
          <div className="participants-grid" ref={containerRef}>
            {participants.map((participant) => {
              const display = getParticipantDisplay(participant);
                const feedState = getParticipantFeedState(participant);
              return (
                <div key={participant.sid} className="participant-tile">
                    <div className="video-container">
                      <div id={`participant-video-${participant.sid}`} className="video-slot">
                        <div className="placeholder">
                          <div className="spinner-small"></div>
                          <p>{display.name}</p>
                        </div>
                      </div>
                      <div className="broadcast-lower-third">
                        <span className={`live-bug ${feedState.hasVideo ? "live" : "ready"}`}>{feedState.stateLabel}</span>
                        <div className="lower-third-text">
                          <span className="lower-third-name">{display.name}</span>
                          <span className="lower-third-location">{display.location}</span>
                        </div>
                        <span className="lower-third-role">{String(display.role).toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="participant-info">
                      <div className="participant-name">Audio / Talkback</div>
                      <div className="participant-location">{display.location}</div>
                      <div className="participant-stats">
                        <span className={`stat ${feedState.hasVideo ? "active" : ""}`}>
                          📹 {feedState.hasVideo ? "Video Live" : "Video Ready"}
                        </span>
                        <span className={`stat ${feedState.hasAudio ? "active" : ""}`}>
                          🎧 {feedState.hasAudio ? "Audio Live" : "Audio Ready"}
                        </span>
                        <span className={`stat ${participant.audioLevel > 0.1 ? "active" : ""}`}>
                          🎤 {Math.round((participant.audioLevel || 0) * 100)}%
                        </span>
                        <span className={`stat ${participant.isSpeaking ? "speaking" : ""}`}>
                          {participant.isSpeaking ? "🔊" : "🔇"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        )}
      </div>
    );
  }

  export default ProducerMonitoring;
