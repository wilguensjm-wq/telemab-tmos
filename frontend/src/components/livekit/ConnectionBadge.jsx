function getTone(connectionStatus) {
  const token = String(connectionStatus || "").toLowerCase();
  if (token.includes("connected")) return "green";
  if (token.includes("degraded") || token.includes("reconnect")) return "amber";
  if (token.includes("offline") || token.includes("disconnect")) return "slate";
  return "cyan";
}

export default function ConnectionBadge({ connectionStatus = "Unknown" }) {
  return (
    <span className={`data-source-badge ${getTone(connectionStatus)}`}>
      {connectionStatus}
    </span>
  );
}
