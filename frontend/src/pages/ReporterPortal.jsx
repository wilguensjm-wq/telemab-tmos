import { useEffect, useState, useRef } from "react";
import { liveKitService } from "../services/liveKitService";
import { reporterControlService } from "../services/reporterControlService";
import { useNotification } from "../hooks/useNotification";
import "../styles/reporter-portal.css";

export default function ReporterPortal() {
  const [roomState, setRoomState] = useState(null);
  const [connectionState, setConnectionState] = useState("offline");
  const [wsConnected, setWsConnected] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [networkQuality, setNetworkQuality] = useState("Unknown");
  const [reporterStatus, setReporterStatus] = useState("offline");
  const [isJoining, setIsJoining] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionsMessage, setPermissionsMessage] = useState("Step 1 required before connecting.");
  const [connectionError, setConnectionError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const notification = useNotification();
  const videoPreviewRef = useRef(null);

  // Subscribe to LiveKit service updates
  useEffect(() => {
    const unsubscribe = liveKitService.onParticipantEvents((state) => {
      setRoomState(state);
      setConnectionState(state.connectionState);
      setWsConnected(state.wsConnected);
      setCameraEnabled(state.cameraEnabled);
      setMicrophoneEnabled(state.microphoneEnabled);
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

    if (!previewEl) {
      return undefined;
    }

    if (!roomState?.isJoined || !cameraEnabled) {
      previewEl.pause();
      previewEl.srcObject = null;
      setPreviewError("");
      return undefined;
    }

    const localVideoTrack = liveKitService.getLocalCameraTrack();
    if (!localVideoTrack?.mediaStreamTrack) {
      previewEl.pause();
      previewEl.srcObject = null;
      setPreviewError("Camera started, but preview track is not available yet.");
      return undefined;
    }

    const stream = new MediaStream([localVideoTrack.mediaStreamTrack]);
    previewEl.srcObject = stream;
    previewEl.muted = true;
    previewEl.playsInline = true;

    previewEl.play()
      .then(() => {
        setPreviewError("");
      })
      .catch((error) => {
        setPreviewError(error?.message || "Unable to play camera preview.");
      });

    return () => {
      previewEl.pause();
      previewEl.srcObject = null;
    };
  }, [roomState?.isJoined, cameraEnabled]);

  const handleJoinRoom = async () => {
    if (!permissionsGranted) {
      notification.error("Grant camera and microphone access before connecting to LiveKit.");
      return;
    }

    setIsJoining(true);
    setConnectionError("");
    try {
      console.info("[ReporterPortal] join:start");
      const result = await liveKitService.joinRoom({
        roomName: "tmos-live-sources",
        identity: `reporter-${Date.now()}`,
        role: "reporter",
        metadata: { type: "field-reporter" },
      });
      if (result) {
        console.info("[ReporterPortal] join:success", { connectionState: result.connectionState });
        console.info("[ReporterPortal] media:auto-start:start");
        let mediaStartupFailed = false;
        try {
          await liveKitService.publishCamera(true);
          console.info("[ReporterPortal] media:auto-start:camera-success");
        } catch (cameraError) {
          const message = cameraError?.message || String(cameraError);
          console.info("[ReporterPortal] media:auto-start:camera-error", { message, stack: cameraError?.stack || null });
          setConnectionError(message);
          notification.error(message);
          mediaStartupFailed = true;
        }

        try {
          await liveKitService.publishMicrophone(true);
          console.info("[ReporterPortal] media:auto-start:microphone-success");
        } catch (microphoneError) {
          const message = microphoneError?.message || String(microphoneError);
          console.info("[ReporterPortal] media:auto-start:microphone-error", { message, stack: microphoneError?.stack || null });
          setConnectionError(message);
          notification.error(message);
          mediaStartupFailed = true;
        }

        if (mediaStartupFailed) {
          notification.success("Connected to broadcast room. Use Start Camera / Start Microphone to retry media.");
        } else {
          notification.success("Connected to broadcast room");
        }
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
    try {
      const newState = !cameraEnabled;
      console.info("[ReporterPortal] camera:toggle", { enabled: newState });
      
      // Monitor for unexpected disconnection during camera publish
      const connectionStateMonitor = setInterval(() => {
        if (!wsConnected && newState) {
          clearInterval(connectionStateMonitor);
          notification.error("Connection lost while enabling camera");
        }
      }, 500);
      
      const snapshot = await liveKitService.publishCamera(newState);
      clearInterval(connectionStateMonitor);

      setCameraEnabled(Boolean(snapshot?.cameraEnabled));
      notification.success(newState ? "Camera enabled" : "Camera disabled");
    } catch (error) {
      console.info("[ReporterPortal] camera:error", { message: error?.message || String(error) });
      notification.error(`Camera error: ${error.message || "Failed to toggle camera"}`);
    }
  };

  const handleToggleMicrophone = async () => {
    try {
      const newState = !microphoneEnabled;
      console.info("[ReporterPortal] microphone:toggle", { enabled: newState });
      
      // Monitor for unexpected disconnection during microphone publish
      const connectionStateMonitor = setInterval(() => {
        if (!wsConnected && newState) {
          clearInterval(connectionStateMonitor);
          notification.error("Connection lost while enabling microphone");
        }
      }, 500);
      
      const snapshot = await liveKitService.publishMicrophone(newState);
      clearInterval(connectionStateMonitor);

      setMicrophoneEnabled(Boolean(snapshot?.microphoneEnabled));
      notification.success(newState ? "Microphone enabled" : "Microphone disabled");
    } catch (error) {
      console.info("[ReporterPortal] microphone:error", { message: error?.message || String(error) });
      notification.error(error.message || "Microphone unavailable. No microphone was detected. Check that your microphone is connected, allow microphone permission in the browser, or close any app using it, then try again.");
    }
  };

  const inlineStatusMessage = !roomState?.isJoined && connectionState !== "Error"
    ? permissionsMessage
    : connectionError;

  return (
    <div className="reporter-portal">
      <div className="reporter-portal-header">
        <h1>📡 Reporter Portal</h1>
        <p>Field Reporter Broadcast Control</p>
      </div>

      {/* Connection Status Card */}
      <div className="status-grid">
        <div className={`status-card status-${reporterStatus}`}>
          <div className="status-indicator"></div>
          <div className="status-label">Connection</div>
          <div className="status-value">{reporterStatus.toUpperCase()}</div>
          <div className="status-detail">{connectionState}</div>
        </div>

        <div className="status-card">
          <div className="quality-indicator">{networkQuality === "Unknown" ? "⚠️" : "✓"}</div>
          <div className="status-label">Network Quality</div>
          <div className="status-value">{networkQuality}</div>
          <div className="status-detail">Signal strength</div>
        </div>

        <div className={`status-card ${cameraEnabled ? "active" : ""}`}>
          <div className="media-icon">📹</div>
          <div className="status-label">Camera</div>
          <div className="status-value">{cameraEnabled ? "ON" : "OFF"}</div>
          <div className="status-detail">Video publishing</div>
        </div>

        <div className={`status-card ${microphoneEnabled ? "active" : ""}`}>
          <div className="media-icon">🎤</div>
          <div className="status-label">Microphone</div>
          <div className="status-value">{microphoneEnabled ? "ON" : "OFF"}</div>
          <div className="status-detail">Audio publishing</div>
        </div>
      </div>

      {/* Main Controls */}
      <div className="controls-section">
        <div className="primary-controls">
          {!roomState?.isJoined ? (
            <button
              className={`btn ${permissionsGranted ? "btn-active" : "btn-secondary"} btn-large`}
              onClick={handleGrantPermissions}
              disabled={isRequestingPermissions || isJoining}
            >
              {isRequestingPermissions ? "Requesting Access..." : "Step 1: Grant Camera & Microphone Access"}
            </button>
          ) : null}

          {!roomState?.isJoined ? (
            <button
              className="btn btn-primary btn-large"
              onClick={handleJoinRoom}
              disabled={isJoining || !permissionsGranted}
            >
              {isJoining ? "Connecting..." : "Step 2: Connect to LiveKit"}
            </button>
          ) : (
            <button
              className="btn btn-danger btn-large"
              onClick={handleLeaveRoom}
            >
              🚫 Leave Broadcast Room
            </button>
          )}
        </div>

        {!roomState?.isJoined ? (
          <p className="status-detail" style={{ marginTop: "0.75rem", textAlign: "center" }}>
            {inlineStatusMessage}
          </p>
        ) : null}

        {connectionError ? (
          <p className="preview-error" style={{ marginTop: "0.75rem", textAlign: "center" }}>
            {connectionError}
          </p>
        ) : null}

        {roomState?.isJoined && (
          <div className="secondary-controls">
            <button
              className={`btn ${cameraEnabled ? "btn-active" : "btn-secondary"} btn-large`}
              onClick={handleToggleCamera}
              disabled={!wsConnected}
            >
              {cameraEnabled ? "📹 Stop Camera" : "📹 Start Camera"}
            </button>
            <button
              className={`btn ${microphoneEnabled ? "btn-active" : "btn-secondary"} btn-large`}
              onClick={handleToggleMicrophone}
              disabled={!wsConnected}
            >
              {microphoneEnabled ? "🎤 Mute Microphone" : "🎤 Start Microphone"}
            </button>
          </div>
        )}
      </div>

      {roomState?.isJoined && (
        <section className="preview-panel">
          <div className="preview-panel-header">
            <h3>Local Camera Preview</h3>
            <span>{cameraEnabled ? "Live" : "Camera off"}</span>
          </div>
          <div className="preview-frame">
            <video ref={videoPreviewRef} autoPlay playsInline muted />
            {!cameraEnabled ? <p className="preview-placeholder">Start camera to see your live preview.</p> : null}
          </div>
          {previewError ? <p className="preview-error">{previewError}</p> : null}
        </section>
      )}

      {/* Instructions */}
      <div className="instructions-panel">
        <h3>📋 Getting Started</h3>
        <ol>
          <li><strong>Join Broadcast Room</strong> - Connect to the broadcast infrastructure</li>
          <li><strong>Enable Camera</strong> - Start publishing your video (once approved)</li>
          <li><strong>Enable Microphone</strong> - Start publishing your audio (once approved)</li>
          <li><strong>Wait for Producer Approval</strong> - Producer will review and approve</li>
          <li><strong>Go Live</strong> - Once approved, you'll be live on air</li>
        </ol>
      </div>

      {/* Connection Details (if joined) */}
      {roomState?.isJoined && (
        <div className="connection-details">
          <h4>Connection Details</h4>
          <div className="details-grid">
            <div className="detail-item">
              <span className="label">Room:</span>
              <span className="value">{roomState.roomName}</span>
            </div>
            <div className="detail-item">
              <span className="label">Identity:</span>
              <span className="value">{roomState.participantIdentity}</span>
            </div>
            <div className="detail-item">
              <span className="label">Role:</span>
              <span className="value">{roomState.participantRole}</span>
            </div>
            <div className="detail-item">
              <span className="label">Participants Connected:</span>
              <span className="value">{roomState.participants?.length || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
