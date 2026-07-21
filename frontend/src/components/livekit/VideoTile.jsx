import ConnectionBadge from "./ConnectionBadge";
import AudioLevelMeter from "./AudioLevelMeter";

export default function VideoTile({ participant }) {
  return (
    <article className="livekit-video-tile">
      <div className="livekit-video-tile-preview">
        <div className="livekit-video-tile-overlay">
          <p className="livekit-video-tile-title">{participant.identity}</p>
          <ConnectionBadge connectionStatus={participant.connectionStatus} />
        </div>

        <div className="livekit-video-placeholder">
          <span>{participant.cameraEnabled ? "Camera live" : "Camera off"}</span>
        </div>

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

      <AudioLevelMeter value={participant.audioLevel} />
    </article>
  );
}
