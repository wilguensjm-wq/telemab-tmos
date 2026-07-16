const LIVE_NOT_CONFIGURED = "Live connection not configured";

function normalizeMessage(message = "") {
  const token = String(message || "").toLowerCase();
  if (
    token.includes("no data available")
    || token.includes("waiting for provider")
    || token.includes("not connected")
    || token.includes("provider not configured")
    || token.includes("no items available yet")
  ) {
    return LIVE_NOT_CONFIGURED;
  }
  return message || LIVE_NOT_CONFIGURED;
}

export default function EmptyTableRow({ colSpan, message = LIVE_NOT_CONFIGURED }) {
  return (
    <tr>
      <td colSpan={colSpan} className="table-empty-cell">
        {normalizeMessage(message)}
      </td>
    </tr>
  );
}