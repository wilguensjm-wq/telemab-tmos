export default function LoadingState({ message = "Loading TMOS data…" }) {
  return (
    <div className="empty-state loading-state">
      <div className="empty-state-icon">⏳</div>
      <h3>Loading</h3>
      <p>{message}</p>
    </div>
  );
}
