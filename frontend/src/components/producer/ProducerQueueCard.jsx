function getInitials(fullName) {
  return (
    fullName
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function formatLabel(value, fallback = "N/A") {
  return value || fallback;
}

export default function ProducerQueueCard({
  reporter,
  variant = "request",
  sectionLabel,
  sectionTone = "amber",
  sectionDetail,
  isBusy = false,
  onApprove,
  onReject,
  onTalkBack,
  onViewDetails,
}) {
  const {
    id,
    fullName,
    email,
    phone,
    location,
    status,
    notes,
    updatedAt,
    requestedAt,
    actionLabel,
    actionAt,
  } = reporter;

  return (
    <article className={`producer-queue-card variant-${variant}`}>
      <div className="producer-card-top">
        <div className="producer-avatar">{getInitials(fullName)}</div>

        <div className="producer-card-heading">
          <div className="producer-card-title-row">
            <div>
              <h4 className="producer-card-title">{formatLabel(fullName, "Unknown Reporter")}</h4>
              <p className="producer-card-subtitle">{formatLabel(location, "📍 Unknown")}</p>
            </div>
            <span className={`producer-card-badge tone-${sectionTone}`}>{sectionLabel}</span>
          </div>

          <p className="producer-card-summary">{sectionDetail}</p>
        </div>
      </div>

      <div className="producer-card-body">
        <div className="producer-card-meta">
          <span>Email</span>
          <strong>{formatLabel(email)}</strong>
        </div>
        <div className="producer-card-meta">
          <span>Phone</span>
          <strong>{formatLabel(phone)}</strong>
        </div>
        <div className="producer-card-meta">
          <span>Status</span>
          <strong>{formatLabel(status)}</strong>
        </div>
        <div className="producer-card-meta">
          <span>Updated</span>
          <strong>{formatLabel(actionAt || requestedAt || updatedAt)}</strong>
        </div>
        {notes ? (
          <div className="producer-card-notes">
            <span>Notes</span>
            <p>{notes}</p>
          </div>
        ) : null}
        {actionLabel ? (
          <div className="producer-card-notes">
            <span>Queue state</span>
            <p>{actionLabel}</p>
          </div>
        ) : null}
      </div>

      <div className="producer-card-actions">
        {onApprove ? (
          <button
            type="button"
            className="action-button action-take-live"
            onClick={() => onApprove("approve", id)}
            disabled={isBusy}
          >
            {isBusy ? "Processing..." : "Approve"}
          </button>
        ) : null}

        {onReject ? (
          <button
            type="button"
            className="action-button action-end-live"
            onClick={() => onReject("reject", id)}
            disabled={isBusy}
          >
            {isBusy ? "Processing..." : "Reject"}
          </button>
        ) : null}

        {onTalkBack ? (
          <button
            type="button"
            className="action-button action-talkback"
            onClick={() => onTalkBack("talkback", id)}
            disabled={isBusy}
          >
            Talk Back
          </button>
        ) : null}

        {onViewDetails ? (
          <button
            type="button"
            className="action-button action-details"
            onClick={() => onViewDetails("details", id)}
            disabled={isBusy}
          >
            View Details
          </button>
        ) : null}
      </div>
    </article>
  );
}