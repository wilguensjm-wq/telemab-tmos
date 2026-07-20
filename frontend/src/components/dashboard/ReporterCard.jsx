export default function ReporterCard({ reporter, onAction }) {
  const {
    id,
    fullName,
    email,
    phone,
    status,
    location = "Unknown",
    connectionQuality = 85,
    batteryLevel = 90,
    microphoneStatus = "on",
    cameraResolution = "1080p",
  } = reporter;

  const statusColors = {
    active: "status-active",
    waiting: "status-waiting",
    offline: "status-offline",
    live: "status-live",
  };

  const connectionQualityClass = {
    poor: "quality-poor",
    fair: "quality-fair",
    good: "quality-good",
    excellent: "quality-excellent",
  };

  const getConnectionQualityLevel = (quality) => {
    if (quality >= 80) return "excellent";
    if (quality >= 60) return "good";
    if (quality >= 40) return "fair";
    return "poor";
  };

  const qualityLevel = getConnectionQualityLevel(connectionQuality);
  const isLive = status?.toLowerCase() === "live";
  const isOffline = status?.toLowerCase() === "offline";

  return (
    <article className={`reporter-card ${statusColors[status?.toLowerCase()] || "status-offline"}`}>
      {/* Header with status badge */}
      <div className="reporter-card-header">
        <div className="reporter-avatar-container">
          <div className="reporter-avatar">
            <span className="avatar-initials">
              {fullName
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "?"}
            </span>
          </div>
          <span className={`status-badge ${statusColors[status?.toLowerCase()] || "status-offline"}`}>
            {status?.charAt(0).toUpperCase() + (status?.slice(1) || "Offline")}
          </span>
        </div>

        <div className="reporter-header-info">
          <h3 className="reporter-name">{fullName || "Unknown Reporter"}</h3>
          <p className="reporter-location">📍 {location}</p>
        </div>
      </div>

      {/* Contact Info */}
      <div className="reporter-contact">
        <div className="contact-item">
          <span className="contact-label">Email:</span>
          <span className="contact-value">{email || "N/A"}</span>
        </div>
        {phone && (
          <div className="contact-item">
            <span className="contact-label">Phone:</span>
            <span className="contact-value">{phone}</span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="reporter-metrics">
        <div className="metric-item">
          <div className="metric-header">
            <span className="metric-label">Connection</span>
            <span className={`metric-value-badge ${connectionQualityClass[qualityLevel]}`}>
              {connectionQuality}%
            </span>
          </div>
          <div className={`metric-bar ${connectionQualityClass[qualityLevel]}`}>
            <div
              className="metric-fill"
              style={{ width: `${connectionQuality}%` }}
            />
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span className="metric-label">Battery</span>
            <span className={`metric-value-badge ${batteryLevel > 30 ? "quality-good" : "quality-poor"}`}>
              {batteryLevel}%
            </span>
          </div>
          <div className={`metric-bar ${batteryLevel > 30 ? "quality-good" : "quality-poor"}`}>
            <div className="metric-fill" style={{ width: `${batteryLevel}%` }} />
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span className="metric-label">Camera</span>
            <span className="metric-value">{cameraResolution}</span>
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span className="metric-label">Microphone</span>
            <span className={`metric-value mic-status ${microphoneStatus === "on" ? "mic-on" : "mic-off"}`}>
              {microphoneStatus === "on" ? "🎤 On" : "🔇 Off"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="reporter-actions">
        {isLive ? (
          <button
            className="action-button action-end-live"
            onClick={() => onAction("end-live", id)}
            title="End live broadcast"
          >
            End Live
          </button>
        ) : isOffline ? (
          <button
            className="action-button action-unavailable"
            disabled
            title="Reporter is offline"
          >
            Offline
          </button>
        ) : (
          <button
            className="action-button action-take-live"
            onClick={() => onAction("take-live", id)}
            title="Take reporter live"
          >
            Take Live
          </button>
        )}

        <button
          className="action-button action-talkback"
          onClick={() => onAction("talkback", id)}
          disabled={isOffline}
          title="Talkback to reporter"
        >
          Talk Back
        </button>

        <button
          className={`action-button ${microphoneStatus === "on" ? "action-mute" : "action-unmute"}`}
          onClick={() => onAction(microphoneStatus === "on" ? "mute" : "unmute", id)}
          disabled={isOffline}
          title={microphoneStatus === "on" ? "Mute microphone" : "Unmute microphone"}
        >
          {microphoneStatus === "on" ? "Mute" : "Unmute"}
        </button>

        <button
          className="action-button action-details"
          onClick={() => onAction("details", id)}
          title="View reporter details"
        >
          Details
        </button>
      </div>
    </article>
  );
}
