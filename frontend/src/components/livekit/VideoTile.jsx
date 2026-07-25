import { useEffect, useRef, useState } from "react";
import ConnectionBadge from "./ConnectionBadge";
import AudioLevelMeter from "./AudioLevelMeter";
import { liveKitService } from "../../services/liveKitService";

export default function VideoTile({ participant }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoError, setVideoError] = useState("");

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) {
      return undefined;
    }

    const videoTrack = liveKitService.getVideoTrackForParticipant(participant.identity);

    if (!videoTrack) {
      videoEl.pause();
      videoEl.srcObject = null;
      setHasVideo(false);
      setVideoError("");
      return undefined;
    }

    videoTrack.attach(videoEl);
    videoEl.playsInline = true;
    videoEl.muted = true;

    videoEl.play()
      .then(() => {
        setHasVideo(true);
        setVideoError("");
      })
      .catch((error) => {
        setHasVideo(Boolean(videoEl.srcObject));
        setVideoError(error?.message || "Unable to play video track.");
      });

    return () => {
      videoTrack.detach(videoEl);
      videoEl.pause();
      videoEl.srcObject = null;
      setHasVideo(false);
    };
  }, [participant.identity, participant.trackSid, participant.cameraEnabled]);

  return (
    <article className="livekit-video-tile">
      <div className="livekit-video-tile-preview">
        <video ref={videoRef} className="livekit-video-element" autoPlay playsInline muted />
        <div className="livekit-video-tile-overlay">
          <p className="livekit-video-tile-title">{participant.identity}</p>
          <ConnectionBadge connectionStatus={participant.connectionStatus} />
        </div>

        {!hasVideo ? (
          <div className="livekit-video-placeholder">
            <span>{participant.cameraEnabled ? "Awaiting video track" : "Camera off"}</span>
          </div>
        ) : null}

        {participant.speaking ? <span className="livekit-speaking-indicator">Speaking</span> : null}
      </div>

      <div className="livekit-video-tile-metrics">
        <div>
          <span>Role</span>
          <strong>{participant.role || "reporter"}</strong>
        </div>
        <div>
          <span>Microphone</span>
          <strong>{participant.microphoneEnabled ? "On" : "Off"}</strong>
        </div>
        <div>
          <span>Network Quality</span>
          <strong>{participant.networkQuality || "Unknown"}</strong>
        </div>
        <div>
          <span>Track Resolution</span>
          <strong>{participant.trackResolution || "Unknown"}</strong>
        </div>
      </div>

      {videoError ? <p className="livekit-error-text">{videoError}</p> : null}

      <AudioLevelMeter value={participant.audioLevel} />
    </article>
  );
}
