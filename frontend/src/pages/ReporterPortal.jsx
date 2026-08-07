import { useEffect, useState, useRef } from "react";
import { liveKitService } from "../services/liveKitService";
import { reporterControlService } from "../services/reporterControlService";
import { useNotification } from "../hooks/useNotification";
import { useAuth } from "../contexts/AuthContext";
import { dispatchReporterControlRefresh } from "../utils/reporterControlSync";
import { useBackendHealth, SystemStatusBar, SystemAboutModal } from "../components/common/SystemStatus";
import "../styles/reporter-portal.css";
import "../styles/system-status.css";

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

async function traceAwait(label, operation, warnAfterMs = 8000) {
  console.info(`[ReporterPortal] ${label}:start`);
  const pendingTimer = setTimeout(() => {
    console.info(`[ReporterPortal] ${label}:pending`, { elapsedMs: warnAfterMs });
  }, warnAfterMs);

  try {
    const result = await operation();
    clearTimeout(pendingTimer);
    console.info(`[ReporterPortal] ${label}:success`);
    return result;
  } catch (error) {
    clearTimeout(pendingTimer);
    console.info(`[ReporterPortal] ${label}:error`, {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw error;
  }
}

export default function ReporterPortal() {
  const [roomState, setRoomState] = useState(null);
  const [connectionState, setConnectionState] = useState("offline");
  const [wsConnected, setWsConnected] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraTrackVersion, setCameraTrackVersion] = useState(0);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState("unknown");
  const [cameraSwitchInProgress, setCameraSwitchInProgress] = useState(false);
  const [cameraSwitchAvailable, setCameraSwitchAvailable] = useState(false);
  const [cameraControlMode, setCameraControlMode] = useState("mobile");
  const [cameraProfile, setCameraProfile] = useState("hd");
  const [cameraZoom, setCameraZoom] = useState(1);
  const [cameraStabilizationMode, setCameraStabilizationMode] = useState("off");
  const [showMobileCameraUi, setShowMobileCameraUi] = useState(false);
  const [availableVideoInputCount, setAvailableVideoInputCount] = useState(0);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [talkbackActive, setTalkbackActive] = useState(false);
  const [talkbackSource, setTalkbackSource] = useState("");
  const [networkQuality, setNetworkQuality] = useState("Unknown");
  const [reporterStatus, setReporterStatus] = useState("offline");
  const [isJoining, setIsJoining] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionsMessage, setPermissionsMessage] = useState("Step 1 required before connecting.");
  const [connectionError, setConnectionError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [gpsLabel, setGpsLabel] = useState("Unavailable");
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [batteryCharging, setBatteryCharging] = useState(null);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [onAirName, setOnAirName] = useState("");
  const [onAirLocation, setOnAirLocation] = useState("");
  const [producerApprovalState, setProducerApprovalState] = useState("pending");
  const notification = useNotification();
  const { user } = useAuth();
  const systemHealth = useBackendHealth();
  const [showAbout, setShowAbout] = useState(false);
  const videoPreviewRef = useRef(null);
  const talkbackAudioRef = useRef(null);
  const previewTrackIdRef = useRef(null);
  const attachedPreviewTrackRef = useRef(null);
  const attachedTalkbackTrackRef = useRef(null);
  const previewMissingTrackTimerRef = useRef(null);
  const reporterRecordRef = useRef(null);
  const videoDebugEnabledRef = useRef(isVideoDebugEnabled());
  const videoDebugCountersRef = useRef({
    renders: 0,
    attach: 0,
    detach: 0,
    trackReplacement: 0,
  });

  videoDebugCountersRef.current.renders += 1;

  const logVideoDebug = (event, extra = {}) => {
    if (!videoDebugEnabledRef.current) return;
    console.info("[ReporterVideoDebug]", {
      event,
      counters: videoDebugCountersRef.current,
      ...extra,
    });
  };

  const buildReporterIdentity = (reporterRecord) => {
    const reporterIdToken = String(reporterRecord?.id || "").trim();
    const usernameToken = String(user?.username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    const seed = reporterIdToken || usernameToken || "reporter";
    return `reporter-${seed}-${Date.now()}`;
  };

  const getClientDeviceType = () => {
    if (typeof navigator === "undefined") {
      return "unknown";
    }

    const ua = String(navigator.userAgent || "").toLowerCase();
    if (ua.includes("ipad") || ua.includes("tablet")) return "tablet";
    if (ua.includes("iphone") || ua.includes("android") || ua.includes("mobile")) return "phone";
    if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "laptop-desktop";
    return "unknown";
  };

  const getClientBrowser = () => {
    if (typeof navigator === "undefined") {
      return "unknown";
    }

    const ua = String(navigator.userAgent || "").toLowerCase();
    if (ua.includes("edg/")) return "Edge";
    if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
    if (ua.includes("chrome/") && !ua.includes("edg/")) return "Chrome";
    if (ua.includes("safari/") && !ua.includes("chrome/")) return "Safari";
    if (ua.includes("firefox/")) return "Firefox";
    return "unknown";
  };

  const resolveReporterLocation = (reporterRecord) => {
    const location = String(reporterRecord?.location || "").trim();
    return location || "Field Location";
  };

  const permissionBlockedPattern = /blocked by browser permissions|secure origin|permission denied|allow camera|allow microphone/i;

  const normalizeApprovalState = (status) => {
    const token = String(status || "").trim().toLowerCase();
    if (token === "live") return "approved";
    if (["waiting", "ready", "online", "connecting"].includes(token)) return "waiting";
    if (["offline", "rejected"].includes(token)) return "not-approved";
    return "pending";
  };

  const isProducerApproved = producerApprovalState === "approved";

  useEffect(() => {
    const defaultName = String(user?.name || user?.username || "").trim();
    if (defaultName && !onAirName) {
      setOnAirName(defaultName);
    }
  }, [user?.name, user?.username, onAirName]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const compactQuery = window.matchMedia("(max-width: 900px)");
    const touchQuery = window.matchMedia("(pointer: coarse)");

    const refresh = () => {
      const ua = String(window.navigator?.userAgent || "").toLowerCase();
      const safariMobile = /iphone|ipod|ipad/.test(ua);
      setShowMobileCameraUi(Boolean(compactQuery.matches || touchQuery.matches || safariMobile));
    };

    refresh();

    if (typeof compactQuery.addEventListener === "function") {
      compactQuery.addEventListener("change", refresh);
      touchQuery.addEventListener("change", refresh);
    } else {
      compactQuery.addListener(refresh);
      touchQuery.addListener(refresh);
    }

    window.addEventListener("orientationchange", refresh);

    return () => {
      if (typeof compactQuery.removeEventListener === "function") {
        compactQuery.removeEventListener("change", refresh);
        touchQuery.removeEventListener("change", refresh);
      } else {
        compactQuery.removeListener(refresh);
        touchQuery.removeListener(refresh);
      }
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsLabel("Unavailable");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude || 0).toFixed(5);
        const lon = Number(position?.coords?.longitude || 0).toFixed(5);
        setGpsLabel(`${lat}, ${lon}`);
      },
      () => {
        setGpsLabel("Permission denied");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 8000,
      },
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // Ignore watch cleanup errors.
      }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getBattery !== "function") {
      return undefined;
    }

    let disposed = false;
    let batteryManager = null;

    const syncBattery = () => {
      if (!batteryManager || disposed) return;
      setBatteryLevel(Math.round(Number(batteryManager.level || 0) * 100));
      setBatteryCharging(Boolean(batteryManager.charging));
    };

    navigator.getBattery()
      .then((battery) => {
        if (disposed) return;
        batteryManager = battery;
        syncBattery();
        battery.addEventListener("levelchange", syncBattery);
        battery.addEventListener("chargingchange", syncBattery);
      })
      .catch(() => {
        // Ignore unsupported battery API failures.
      });

    return () => {
      disposed = true;
      if (batteryManager) {
        batteryManager.removeEventListener("levelchange", syncBattery);
        batteryManager.removeEventListener("chargingchange", syncBattery);
      }
    };
  }, []);

  // Subscribe to LiveKit service updates
  useEffect(() => {
    const unsubscribe = liveKitService.onParticipantEvents((state) => {
      setRoomState(state);
      setConnectionState(state.connectionState);
      setWsConnected(state.wsConnected);
      setCameraEnabled(state.cameraEnabled);
      setCameraTrackVersion(Number(state.cameraTrackVersion || 0));
      setMicrophoneEnabled(state.microphoneEnabled);
      setCameraFacingMode(state.cameraFacingMode || "unknown");
      setCameraSwitchInProgress(Boolean(state.cameraSwitchInProgress));
      setCameraSwitchAvailable(Boolean(state.cameraSwitchAvailable));
      setCameraControlMode(state.cameraControlMode || "mobile");
      setCameraProfile(state.cameraProfile || "hd");
      setCameraZoom(Number(state.cameraZoom || 1));
      setCameraStabilizationMode(state.cameraStabilizationMode || "off");
      setAvailableVideoInputCount(Number(state.availableVideoInputCount || 0));
      setVideoInputDevices(Array.isArray(state.videoInputDevices) ? state.videoInputDevices : []);
      setSelectedVideoDeviceId(state.selectedVideoDeviceId || "");
      setNetworkQuality(state.networkQuality);
      setConnectionError(state.lastError || "");
    });

    return unsubscribe;
  }, []);

  // Map LiveKit connection state to reporter status
  useEffect(() => {
    const statusMap = {
      "Connected": "online",
      "Connecting": "connecting",
      "Degraded": "degraded",
      "Offline": "offline",
      "Unknown": "offline",
    };
    setReporterStatus(statusMap[connectionState] || "offline");
  }, [connectionState]);

  useEffect(() => {
    const previewEl = videoPreviewRef.current;
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

    if (!previewEl) {
      return () => {
        if (previewEl) {
          Object.entries(eventHandlers).forEach(([event, handler]) => previewEl.removeEventListener(event, handler));
        }
      };
    }

    const localVideoTrack = liveKitService.getLocalCameraTrack();
    if (!localVideoTrack?.mediaStreamTrack) {
      if (!roomState?.isJoined || !cameraEnabled) {
        if (previewMissingTrackTimerRef.current) {
          clearTimeout(previewMissingTrackTimerRef.current);
          previewMissingTrackTimerRef.current = null;
        }
        if (attachedPreviewTrackRef.current) {
          try {
            videoDebugCountersRef.current.detach += 1;
            logVideoDebug("preview.detach", {
              mediaTrackId: attachedPreviewTrackRef.current.mediaStreamTrack?.id || "unknown",
              detachCount: videoDebugCountersRef.current.detach,
            });
            attachedPreviewTrackRef.current.detach(previewEl);
          } catch {
            // Ignore detach failures during preview cleanup.
          }
          attachedPreviewTrackRef.current = null;
        }
        previewEl.srcObject = null;
        previewTrackIdRef.current = null;
        setPreviewError("");
        return undefined;
      }

      if (!previewMissingTrackTimerRef.current) {
        previewMissingTrackTimerRef.current = setTimeout(() => {
          setPreviewError("Camera started, but preview track is not available yet.");
          previewMissingTrackTimerRef.current = null;
        }, 1500);
      }
      return undefined;
    }

    if (previewMissingTrackTimerRef.current) {
      clearTimeout(previewMissingTrackTimerRef.current);
      previewMissingTrackTimerRef.current = null;
    }

    const trackId = localVideoTrack.mediaStreamTrack.id || "track";
    if (previewTrackIdRef.current === trackId && attachedPreviewTrackRef.current === localVideoTrack) {
      setPreviewError("");
      return undefined;
    }

    if (attachedPreviewTrackRef.current) {
      try {
        videoDebugCountersRef.current.trackReplacement += 1;
        videoDebugCountersRef.current.detach += 1;
        logVideoDebug("preview.track-replacement", {
          replacementCount: videoDebugCountersRef.current.trackReplacement,
          detachCount: videoDebugCountersRef.current.detach,
          previousTrackId: attachedPreviewTrackRef.current.mediaStreamTrack?.id || "unknown",
          nextTrackId: localVideoTrack.mediaStreamTrack?.id || "unknown",
        });
        attachedPreviewTrackRef.current.detach(previewEl);
      } catch {
        // Ignore detach failures during track replacement.
      }
      attachedPreviewTrackRef.current = null;
    }

    previewTrackIdRef.current = trackId;
    attachedPreviewTrackRef.current = localVideoTrack;
    previewEl.muted = true;
    previewEl.playsInline = true;
    previewEl.autoplay = true;
    previewEl.srcObject = null;
    videoDebugCountersRef.current.attach += 1;
    logVideoDebug("preview.attach", {
      attachCount: videoDebugCountersRef.current.attach,
      mediaTrackId: trackId,
    });
    localVideoTrack.attach(previewEl);

    previewEl.play()
      .then(() => {
        setPreviewError("");
      })
      .catch((error) => {
        const isPlayInterruption = String(error?.message || "").toLowerCase().includes("interrupted by a call to pause");
        const isAbortError = error?.name === "AbortError";

        if (isPlayInterruption || isAbortError) {
          // Benign race during rapid re-render/cleanup in dev; do not surface as user-facing error.
          return;
        }

        setPreviewError(error?.message || "Unable to play camera preview.");
      });

    return () => {
      if (previewMissingTrackTimerRef.current) {
        clearTimeout(previewMissingTrackTimerRef.current);
        previewMissingTrackTimerRef.current = null;
      }

      if (attachedPreviewTrackRef.current === localVideoTrack) {
        try {
          videoDebugCountersRef.current.detach += 1;
          logVideoDebug("preview.detach", {
            mediaTrackId: localVideoTrack.mediaStreamTrack?.id || "unknown",
            detachCount: videoDebugCountersRef.current.detach,
          });
          attachedPreviewTrackRef.current.detach(previewEl);
        } catch {
          // Ignore detach failures during effect cleanup.
        }
        attachedPreviewTrackRef.current = null;
      }

      if (previewEl) {
        Object.entries(eventHandlers).forEach(([event, handler]) => previewEl.removeEventListener(event, handler));
      }
    };
  }, [roomState?.isJoined, cameraEnabled, cameraTrackVersion, selectedVideoDeviceId, cameraFacingMode]);

  useEffect(() => {
    const audioEl = talkbackAudioRef.current;
    const detach = () => {
      const track = attachedTalkbackTrackRef.current;
      if (track && audioEl) {
        try {
          track.detach(audioEl);
        } catch {
          // Ignore detach failures during talkback cleanup.
        }
      }

      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
      }

      attachedTalkbackTrackRef.current = null;
      setTalkbackActive(false);
      setTalkbackSource("");
    };

    if (!audioEl || !roomState?.isJoined || !wsConnected) {
      detach();
      return detach;
    }

    const details = liveKitService.getProducerTalkbackTrack();
    const track = details?.track || null;
    if (!track) {
      detach();
      return detach;
    }

    if (attachedTalkbackTrackRef.current !== track) {
      if (attachedTalkbackTrackRef.current && audioEl) {
        try {
          attachedTalkbackTrackRef.current.detach(audioEl);
        } catch {
          // Ignore detach failures during talkback track replacement.
        }
      }

      track.attach(audioEl);
      attachedTalkbackTrackRef.current = track;
    }

    audioEl.muted = false;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.volume = 1;
    audioEl.play().catch(() => {});

    setTalkbackActive(true);
    setTalkbackSource(details?.participantIdentity || "producer");

    return detach;
  }, [roomState?.isJoined, wsConnected, roomState?.participants]);

  useEffect(() => {
    if (!roomState?.isJoined || !reporterRecordRef.current?.id) {
      return undefined;
    }

    let disposed = false;

    const refreshApproval = async () => {
      try {
        const latestReporter = await reporterControlService.getReporterById(reporterRecordRef.current.id);
        if (!latestReporter || disposed) {
          return;
        }

        reporterRecordRef.current = latestReporter;
        const nextApprovalState = normalizeApprovalState(latestReporter.status);
        setProducerApprovalState(nextApprovalState);
      } catch (error) {
        if (!disposed) {
          console.info("[ReporterPortal] approval:poll:error", { message: error?.message || String(error) });
        }
      }
    };

    refreshApproval();
    const intervalId = setInterval(refreshApproval, 2000);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [roomState?.isJoined]);

  useEffect(() => {
    if (!roomState?.isJoined || !isProducerApproved || !permissionsGranted) {
      return;
    }

    if (cameraEnabled && microphoneEnabled) {
      return;
    }

    let cancelled = false;

    const startApprovedMedia = async () => {
      try {
        if (!cameraEnabled) {
          const cameraSnapshot = await liveKitService.publishCamera(true);
          if (!cancelled) {
            setCameraEnabled(Boolean(cameraSnapshot?.cameraEnabled));
          }
        }

        if (!microphoneEnabled) {
          const microphoneSnapshot = await liveKitService.publishMicrophone(true);
          if (!cancelled) {
            setMicrophoneEnabled(Boolean(microphoneSnapshot?.microphoneEnabled));
          }
        }

        if (!cancelled) {
          notification.success("Producer approved your feed. Camera and microphone are now live.");
        }
      } catch (error) {
        if (!cancelled) {
          notification.error(error?.message || "Producer approved, but media startup failed. Use Start Camera / Start Microphone.");
        }
      }
    };

    startApprovedMedia();

    return () => {
      cancelled = true;
    };
  }, [roomState?.isJoined, isProducerApproved, permissionsGranted, cameraEnabled, microphoneEnabled, notification]);

  const handleJoinRoom = async () => {
    setIsJoining(true);
    setConnectionError("");
    try {
      const onAirNameValue = String(onAirName || "").trim();
      const onAirLocationValue = String(onAirLocation || "").trim();

      if (!onAirNameValue || !onAirLocationValue) {
        throw new Error("Enter reporter name and live location before connecting.");
      }

      let reporterRecord = reporterRecordRef.current;
      if (!reporterRecord?.id) {
        reporterRecord = await reporterControlService.ensureReporterForUser({
          ...(user || {}),
          name: user?.name || onAirNameValue,
          username: user?.username || onAirNameValue,
          email: user?.email || "",
        });
        reporterRecordRef.current = reporterRecord;

        if (!onAirName) {
          const defaultName = String(reporterRecord?.fullName || user?.name || user?.username || "Reporter").trim();
          setOnAirName(defaultName);
        }

        if (!onAirLocation) {
          const defaultLocation = String(reporterRecord?.location || "").trim();
          if (defaultLocation) {
            setOnAirLocation(defaultLocation);
          }
        }
      }

      if (reporterRecord?.id) {
        const currentName = String(reporterRecord?.fullName || "").trim();
        const currentLocation = String(reporterRecord?.location || "").trim();

        if (currentName !== onAirNameValue || currentLocation !== onAirLocationValue) {
          reporterRecord = await reporterControlService.updateReporter(reporterRecord.id, {
            fullName: onAirNameValue,
            location: onAirLocationValue,
          });
          reporterRecordRef.current = reporterRecord;
        }
      }

      const reporterName = onAirNameValue;
      const reporterLocation = onAirLocationValue;

      console.info("[ReporterPortal] join:start");
      const result = await traceAwait("joinRoom", () => liveKitService.joinRoom({
        roomName: "tmos-live-sources",
        identity: buildReporterIdentity(reporterRecord),
        role: "reporter",
        reporterId: reporterRecord?.id || null,
        metadata: {
          type: "field-reporter",
          role: "reporter",
          reporterId: reporterRecord?.id || null,
          reporterBadgeId: reporterRecord?.id || null,
          reporterName,
          reporterLocation,
          reporterEmail: reporterRecord?.email || user?.email || null,
          deviceType: getClientDeviceType(),
          browser: getClientBrowser(),
        },
      }));
      if (result?.isJoined) {
        console.info("[ReporterPortal] join:success", { connectionState: result.connectionState });

        if (reporterRecord?.id) {
          try {
            await reporterControlService.updateReporterStatus(reporterRecord.id, "pending");
            setProducerApprovalState("pending");
            dispatchReporterControlRefresh({ source: "reporter-portal", action: "pending", reporterId: reporterRecord.id });
          } catch (statusError) {
            console.info("[ReporterPortal] status:waiting:error", { message: statusError?.message || String(statusError) });
          }
        }

        if (!permissionsGranted) {
          notification.success("Connected to broadcast room. Camera and microphone can be enabled manually.");
          return;
        }

        const mediaResults = await Promise.allSettled([
          liveKitService.publishCamera(true),
          liveKitService.publishMicrophone(true),
        ]);

        const mediaFailures = mediaResults.filter((entry) => entry.status === "rejected");
        if (mediaFailures.length === 0) {
          notification.success("Connected. Camera and microphone are live for Producer preview.");
        } else {
          notification.warning("Connected, but media startup was partial. Use Start Camera / Unmute Microphone if needed.");
        }
      } else {
        console.info("[ReporterPortal] join:cancelled-or-not-joined", { result });
      }
    } catch (error) {
      const message = error?.message || String(error);
      console.info("[ReporterPortal] join:error", { message, stack: error?.stack || null });
      setConnectionError(message);
      notification.error(message || "Failed to connect to room");
    } finally {
      setIsJoining(false);
    }
  };

  const handleGrantPermissions = async () => {
    setIsRequestingPermissions(true);
    setPermissionsMessage("Requesting camera and microphone access...");

    try {
      console.info("[ReporterPortal] permissions:start");
      const result = await liveKitService.preflightMediaPermissions();
      if (result?.cameraGranted && result?.microphoneGranted) {
        setPermissionsGranted(true);
        setPermissionsMessage("Camera and microphone access granted.");
        console.info("[ReporterPortal] permissions:granted");
        notification.success("Camera and microphone access granted.");
      }
    } catch (error) {
      setPermissionsGranted(false);
      setPermissionsMessage(error.message || "Unable to grant camera and microphone access.");
      console.info("[ReporterPortal] permissions:error", { message: error?.message || String(error) });
      notification.error(error.message || "Unable to grant camera and microphone access.");
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      console.info("[ReporterPortal] leave:start");
      await liveKitService.leaveRoom();
      if (reporterRecordRef.current?.id) {
        try {
          await reporterControlService.updateReporterStatus(reporterRecordRef.current.id, "offline");
          setProducerApprovalState("not-approved");
          dispatchReporterControlRefresh({ source: "reporter-portal", action: "offline", reporterId: reporterRecordRef.current.id });
        } catch (statusError) {
          console.info("[ReporterPortal] status:offline:error", { message: statusError?.message || String(statusError) });
        }
      }
      const snapshot = liveKitService.getSnapshot();
      setRoomState(snapshot);
      setConnectionState(snapshot.connectionState || "offline");
      setWsConnected(Boolean(snapshot.wsConnected));
      setCameraEnabled(Boolean(snapshot.cameraEnabled));
      setMicrophoneEnabled(Boolean(snapshot.microphoneEnabled));
      setNetworkQuality(snapshot.networkQuality || "Unknown");
      setConnectionError(snapshot.lastError || "");
      console.info("[ReporterPortal] leave:complete", { connectionState: snapshot.connectionState });
      notification.success("Disconnected from broadcast room");
    } catch (error) {
      console.info("[ReporterPortal] leave:error", { message: error?.message || String(error) });
      notification.error(error.message || "Failed to disconnect");
    }
  };

  const handleToggleCamera = async () => {
    let connectionStateMonitor = null;
    try {
      if (!permissionsGranted) {
        const permissionResult = await liveKitService.preflightMediaPermissions();
        if (permissionResult?.cameraGranted && permissionResult?.microphoneGranted) {
          setPermissionsGranted(true);
          setPermissionsMessage("Camera and microphone access granted.");
        }
      }

      const effectiveCameraEnabled = cameraEnabled || Boolean(liveKitService.getLocalCameraTrack());
      const newState = !effectiveCameraEnabled;

      if (newState && !isProducerApproved) {
        if (reporterRecordRef.current?.id) {
          try {
            await reporterControlService.updateReporterStatus(reporterRecordRef.current.id, "pending");
            setProducerApprovalState("pending");
            dispatchReporterControlRefresh({ source: "reporter-portal", action: "pending", reporterId: reporterRecordRef.current.id });
          } catch (statusError) {
            console.info("[ReporterPortal] status:request-approval:error", { message: statusError?.message || String(statusError) });
          }
        }

        notification.info("Approval requested. Trying to start camera locally.");
      }

      console.info("[ReporterPortal] camera:toggle", { enabled: newState, producerApproved: isProducerApproved });

      connectionStateMonitor = setInterval(() => {
        if (!wsConnected && newState) {
          clearInterval(connectionStateMonitor);
          notification.error("Connection lost while enabling camera");
        }
      }, 500);

      const snapshot = await liveKitService.publishCamera(newState);

      setCameraEnabled(Boolean(snapshot?.cameraEnabled));
      notification.success(newState ? "Camera enabled" : "Camera disabled");
    } catch (error) {
      console.info("[ReporterPortal] camera:error", { message: error?.message || String(error) });
      notification.error(`Camera error: ${error.message || "Failed to toggle camera"}`);
    } finally {
      if (connectionStateMonitor) {
        clearInterval(connectionStateMonitor);
      }
    }
  };

  const handleToggleMicrophone = async () => {
    let connectionStateMonitor = null;
    try {
      if (!permissionsGranted) {
        const permissionResult = await liveKitService.preflightMediaPermissions();
        if (permissionResult?.cameraGranted && permissionResult?.microphoneGranted) {
          setPermissionsGranted(true);
          setPermissionsMessage("Camera and microphone access granted.");
        }
      }

      const effectiveMicrophoneEnabled = microphoneEnabled || Boolean(liveKitService.getLocalMicrophoneTrack());
      const newState = !effectiveMicrophoneEnabled;

      if (newState && !isProducerApproved) {
        if (reporterRecordRef.current?.id) {
          try {
            await reporterControlService.updateReporterStatus(reporterRecordRef.current.id, "pending");
            setProducerApprovalState("pending");
            dispatchReporterControlRefresh({ source: "reporter-portal", action: "pending", reporterId: reporterRecordRef.current.id });
          } catch (statusError) {
            console.info("[ReporterPortal] status:request-approval:error", { message: statusError?.message || String(statusError) });
          }
        }

        notification.info("Approval requested. Trying to start microphone locally.");
      }

      console.info("[ReporterPortal] microphone:toggle", { enabled: newState, producerApproved: isProducerApproved });

      connectionStateMonitor = setInterval(() => {
        if (!wsConnected && newState) {
          clearInterval(connectionStateMonitor);
          notification.error("Connection lost while enabling microphone");
        }
      }, 500);

      const snapshot = await liveKitService.publishMicrophone(newState);

      setMicrophoneEnabled(Boolean(snapshot?.microphoneEnabled));
      notification.success(newState ? "Microphone enabled" : "Microphone disabled");
    } catch (error) {
      console.info("[ReporterPortal] microphone:error", { message: error?.message || String(error) });
      notification.error(error.message || "Microphone unavailable. No microphone was detected. Check that your microphone is connected, allow microphone permission in the browser, or close any app using it, then try again.");
    } finally {
      if (connectionStateMonitor) {
        clearInterval(connectionStateMonitor);
      }
    }
  };

  const handleSwitchCamera = async () => {
    try {
      const snapshot = await liveKitService.switchCamera();
      setCameraFacingMode(snapshot?.cameraFacingMode || "unknown");
      setCameraSwitchInProgress(Boolean(snapshot?.cameraSwitchInProgress));
      setCameraSwitchAvailable(Boolean(snapshot?.cameraSwitchAvailable));

      const nextFacing = String(snapshot?.cameraFacingMode || "").toLowerCase();
      if (nextFacing === "rear") {
        notification.success("Switched to rear camera.");
      } else if (nextFacing === "front") {
        notification.success("Switched to front camera.");
      } else {
        notification.success("Camera switched.");
      }
    } catch (error) {
      notification.error(error?.message || "Unable to switch camera.");
    }
  };

  const handleVideoSourceChange = async (event) => {
    const nextDeviceId = String(event?.target?.value || "").trim();
    if (!nextDeviceId) {
      return;
    }

    try {
      setSelectedVideoDeviceId(nextDeviceId);
      const snapshot = await liveKitService.selectVideoInput(nextDeviceId);
      setSelectedVideoDeviceId(snapshot?.selectedVideoDeviceId || nextDeviceId);
      setCameraFacingMode(snapshot?.cameraFacingMode || "unknown");
      setCameraSwitchInProgress(Boolean(snapshot?.cameraSwitchInProgress));
      setCameraSwitchAvailable(Boolean(snapshot?.cameraSwitchAvailable));

      if (cameraEnabled) {
        notification.success("Video source switched.");
      }
    } catch (error) {
      notification.error(error?.message || "Unable to switch video source.");
    }
  };

  const handleCameraProfileChange = async (event) => {
    const nextProfile = String(event?.target?.value || "hd").trim().toLowerCase();
    try {
      const snapshot = await liveKitService.setCameraProfile(nextProfile);
      setCameraProfile(snapshot?.cameraProfile || nextProfile);
      setCameraSwitchInProgress(Boolean(snapshot?.cameraSwitchInProgress));
      if (cameraEnabled) {
        notification.success(nextProfile === "uhd" ? "4K profile requested." : "Camera quality profile applied.");
      }
    } catch (error) {
      notification.error(error?.message || "Unable to apply camera quality profile.");
    }
  };

  const handleCameraZoomChange = async (event) => {
    const nextZoom = Number(event?.target?.value || 1);
    setCameraZoom(nextZoom);

    try {
      const snapshot = await liveKitService.applyCameraEnhancements({ zoom: nextZoom });
      setCameraZoom(Number(snapshot?.cameraZoom || nextZoom));
    } catch (error) {
      notification.error(error?.message || "Unable to apply zoom.");
    }
  };

  const handleStabilizationChange = async (event) => {
    const nextMode = String(event?.target?.value || "off").trim().toLowerCase() === "auto" ? "auto" : "off";

    try {
      const snapshot = await liveKitService.applyCameraEnhancements({ stabilizationMode: nextMode });
      setCameraStabilizationMode(snapshot?.cameraStabilizationMode || nextMode);
      notification.info(nextMode === "auto"
        ? "Video stabilization requested. Applied when supported by your camera/browser."
        : "Video stabilization disabled.");
    } catch (error) {
      notification.error(error?.message || "Unable to update stabilization mode.");
    }
  };

  const nextCameraLabel = cameraFacingMode === "rear"
    ? "Switch to Front Camera"
    : "Switch to Rear Camera";
  const showDesktopVideoSource = Boolean(roomState?.isJoined && !showMobileCameraUi && videoInputDevices.length > 0);
  const showMobileFlipControl = Boolean(roomState?.isJoined && showMobileCameraUi);
  const canAttemptCameraSwitch = Boolean(wsConnected && cameraEnabled && !cameraSwitchInProgress);
  const cameraToggleLabel = cameraEnabled ? "📹 Stop Camera" : "📹 Start Camera";
  const microphoneToggleLabel = microphoneEnabled ? "🎤 Mute Microphone" : "🎤 Unmute Microphone";
  const batteryLabel = batteryLevel === null
    ? "Unknown"
    : `${batteryLevel}%${batteryCharging ? " ⚡" : ""}`;
  const diagnosticsSummary = `Mode ${cameraControlMode || "unknown"} · Sources ${availableVideoInputCount} · Facing ${cameraFacingMode || "unknown"}`;
  const qualityLabel = cameraProfile === "uhd" ? "4K" : cameraProfile === "sd" ? "HD-Ready" : "Full HD";

  const buildSecureLocalUrl = () => {
    if (typeof window === "undefined") {
      return "https://127.0.0.1:5173/reporter-control/reporter-portal";
    }

    // Keep permission-help navigation on the current host so LAN/mobile users
    // do not get redirected to localhost on the phone.
    const protocol = window.location?.protocol === "https:" ? "https:" : "http:";
    const host = window.location?.host || "127.0.0.1:5173";
    const path = window.location?.pathname || "/reporter-control/reporter-portal";
    const search = window.location?.search || "";
    const hash = window.location?.hash || "";
    return `${protocol}//${host}${path}${search}${hash}`;
  };

  const handleOpenPermissionHelp = () => {
    const secureUrl = buildSecureLocalUrl();
    setShowPermissionHelp(true);

    if (typeof window !== "undefined") {
      window.open(secureUrl, "_blank", "noopener,noreferrer");
    }

    notification.info("Permission Help opened. In that tab: lock icon -> Site settings -> Allow Camera and Microphone -> Reload.");
  };

  const handleReloadPage = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const inlineStatusMessage = !roomState?.isJoined && connectionState !== "Error"
    ? (permissionsGranted
      ? permissionsMessage
      : "Camera and microphone access is optional before connecting. You can connect first, then enable media.")
    : connectionError;

  const approvalMessage = roomState?.isJoined
    ? (isProducerApproved
      ? "Producer approved. You are clear to go live."
      : "Waiting for producer approval. Your camera/microphone will go live after approval.")
    : "";

  const hasPermissionBlockSignal = permissionBlockedPattern.test(String(connectionError || ""))
    || permissionBlockedPattern.test(String(permissionsMessage || ""));

  return (
    <>
      <div className="reporter-broadcast-shell">
      <header className="reporter-broadcast-header">
        <div>
          <h1>Reporter Broadcast Console</h1>
          <p>Field contribution feed for TMOS control room</p>
        </div>
        <div className="header-status-chips">
          <span className={`status-chip ${wsConnected ? "ok" : "warn"}`}>Connection: {connectionState}</span>
          <span className="status-chip">Network: {networkQuality}</span>
          <span className={`status-chip ${talkbackActive ? "ok" : "warn"}`}>Talkback: {talkbackActive ? `ON (${talkbackSource || "producer"})` : "OFF"}</span>
          <span className="status-chip">Battery: {batteryLabel}</span>
          <span className="status-chip">GPS: {gpsLabel}</span>
          <SystemStatusBar health={systemHealth} livekitConnected={wsConnected} />
          <button type="button" className="status-chip build-chip build-chip-btn" onClick={() => setShowAbout(true)}>Build: {__BUILD_VERSION__}</button>
        </div>
      </header>

      <audio ref={talkbackAudioRef} className="talkback-audio-monitor" />

      <section className="broadcast-preview-top">
        <div className="preview-title-row">
          <h2>Live Preview</h2>
          <div className="preview-title-actions">
            {showMobileFlipControl ? (
              <button
                type="button"
                className="icon-flip-button"
                onClick={handleSwitchCamera}
                disabled={!canAttemptCameraSwitch}
                title={nextCameraLabel}
                aria-label={nextCameraLabel}
              >
                {cameraSwitchInProgress ? "⏳" : "🔄"}
              </button>
            ) : null}
            <span className={`live-indicator ${cameraEnabled ? "on" : "off"}`}>{cameraEnabled ? "Camera Live" : "Camera Off"}</span>
          </div>
        </div>
        <div className="broadcast-preview-frame">
          <video ref={videoPreviewRef} autoPlay playsInline muted />
          {!cameraEnabled ? <p className="preview-overlay-copy">Start camera to see your live preview.</p> : null}
        </div>
        {previewError ? <p className="preview-error">{previewError}</p> : null}
      </section>

      <section className="identity-strip">
        <label className="onair-field">
          <span>Reporter Name</span>
          <input
            type="text"
            value={onAirName}
            onChange={(event) => setOnAirName(event.target.value)}
            placeholder="e.g. Sarah Johnson"
            maxLength={64}
          />
        </label>
        <label className="onair-field">
          <span>Live Location</span>
          <input
            type="text"
            value={onAirLocation}
            onChange={(event) => setOnAirLocation(event.target.value)}
            placeholder="e.g. Capitol Hill, Washington DC"
            maxLength={96}
          />
        </label>
      </section>

      <section className="essential-controls-grid">
        {!roomState?.isJoined ? (
          <button
            className={`btn ${permissionsGranted ? "btn-active" : "btn-secondary"} btn-large`}
            onClick={handleGrantPermissions}
            disabled={isRequestingPermissions || isJoining}
          >
            {isRequestingPermissions ? "Requesting Permissions..." : "Grant Camera & Microphone"}
          </button>
        ) : null}

        {!roomState?.isJoined ? (
          <button
            className="btn btn-primary btn-large"
            onClick={handleJoinRoom}
            disabled={isJoining}
          >
            {isJoining ? "Connecting..." : "Join Broadcast"}
          </button>
        ) : (
          <button className={`btn ${cameraEnabled ? "btn-active" : "btn-primary"} btn-large`} onClick={handleToggleCamera} disabled={!wsConnected}>
            {cameraToggleLabel}
          </button>
        )}

        {roomState?.isJoined ? (
          <button
            className={`btn ${microphoneEnabled ? "btn-active" : "btn-primary"} btn-large`}
            onClick={handleToggleMicrophone}
            disabled={!wsConnected}
          >
            {microphoneToggleLabel}
          </button>
        ) : null}

        {showDesktopVideoSource ? (
          <label className="onair-field desktop-source-field">
            <span>Video Source</span>
            <select
              value={selectedVideoDeviceId}
              onChange={handleVideoSourceChange}
              disabled={!wsConnected || cameraSwitchInProgress || !videoInputDevices.length}
            >
              {videoInputDevices.map((device, index) => (
                <option key={device.deviceId || `video-${index}`} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {roomState?.isJoined ? (
          <button className="btn btn-danger btn-large" onClick={handleLeaveRoom}>
            Leave Broadcast
          </button>
        ) : null}
      </section>

      <section className="camera-settings-panel">
        <div className="camera-settings-head">
          <h3>Camera Settings</h3>
          <span>{qualityLabel}</span>
        </div>
        <div className="camera-settings-grid">
          <label className="onair-field">
            <span>Quality Profile</span>
            <select value={cameraProfile} onChange={handleCameraProfileChange} disabled={!wsConnected || cameraSwitchInProgress}>
              <option value="sd">HD-Ready (720p)</option>
              <option value="hd">Full HD (1080p)</option>
              <option value="uhd">Ultra HD / 4K</option>
            </select>
          </label>

          <label className="onair-field">
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={cameraZoom}
              onChange={handleCameraZoomChange}
              disabled={!wsConnected || !cameraEnabled}
            />
          </label>

          <label className="onair-field">
            <span>Stabilization</span>
            <select value={cameraStabilizationMode} onChange={handleStabilizationChange} disabled={!wsConnected || !cameraEnabled}>
              <option value="off">Off</option>
              <option value="auto">Auto (if supported)</option>
            </select>
          </label>
        </div>
        {!roomState?.isJoined ? <p className="inline-note">Join broadcast to apply camera settings.</p> : null}
      </section>

      {!roomState?.isJoined ? <p className="inline-note">{inlineStatusMessage}</p> : null}
      {connectionError ? <p className="preview-error">{connectionError}</p> : null}
      {roomState?.isJoined ? <p className="inline-note">{approvalMessage}</p> : null}

      {hasPermissionBlockSignal ? (
        <section className="permission-help-card">
          <div className="permission-help-actions">
            <button className="btn btn-secondary" onClick={handleOpenPermissionHelp}>Open Permission Help</button>
            <button className="btn btn-secondary" onClick={handleReloadPage}>Reload Page</button>
          </div>
          {showPermissionHelp ? (
            <ol>
              <li>Use the newly opened secure tab.</li>
              <li>Click lock icon in address bar, then Site settings.</li>
              <li>Set Camera and Microphone to Allow.</li>
              <li>Reload the secure tab and retry joining broadcast.</li>
            </ol>
          ) : null}
        </section>
      ) : null}

      <details className="diagnostics-panel">
        <summary>Diagnostics</summary>
        <p className="diagnostics-summary-line">{diagnosticsSummary}</p>
        <div className="diagnostics-grid">
          <div className="detail-item"><span className="label">Room</span><span className="value">{roomState?.roomName || "Not joined"}</span></div>
          <div className="detail-item"><span className="label">Identity</span><span className="value">{roomState?.participantIdentity || "n/a"}</span></div>
          <div className="detail-item"><span className="label">Role</span><span className="value">{roomState?.participantRole || "reporter"}</span></div>
          <div className="detail-item"><span className="label">Participants</span><span className="value">{roomState?.participants?.length || 0}</span></div>
          <div className="detail-item"><span className="label">Switch Available</span><span className="value">{String(cameraSwitchAvailable)}</span></div>
          <div className="detail-item"><span className="label">Facing</span><span className="value">{cameraFacingMode || "unknown"}</span></div>
          <div className="detail-item"><span className="label">Video Inputs</span><span className="value">{availableVideoInputCount}</span></div>
          <div className="detail-item"><span className="label">Producer Approval</span><span className="value">{producerApprovalState}</span></div>
        </div>
      </details>
    </div>
    {showAbout && <SystemAboutModal version={__BUILD_VERSION__} health={systemHealth} livekitConnected={wsConnected} onClose={() => setShowAbout(false)} />}
    </>
  );
}
