const LIVE_NOT_CONFIGURED = "Live connection not configured";

function normalizeMessage(message = "") {
  const token = String(message || "").toLowerCase();
  if (
    token.includes("no data")
    || token.includes("waiting for provider")
    || token.includes("not connected")
    || token.includes("provider not configured")
    || token.includes("service unavailable")
  ) {
    return LIVE_NOT_CONFIGURED;
  }
  return message || LIVE_NOT_CONFIGURED;
}

export default function EmptyState({ title = "Nothing to show", message = LIVE_NOT_CONFIGURED }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">◌</div>
      <h3>{title}</h3>
      <p>{normalizeMessage(message)}</p>
    </div>
  );
}
