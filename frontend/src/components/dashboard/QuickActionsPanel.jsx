export default function QuickActionsPanel({ actions }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">Operator Actions</h2>
          <p className="panel-caption">Common tasks for the next shift</p>
        </div>
      </div>

      <div className="assistant-list">
        {actions.length === 0 ? (
          <p className="panel-empty-message">Provider Not Configured</p>
        ) : (
          actions.map((action) => (
            <button key={action.label} type="button" className="assistant-item quick-action">
              <span className="quick-action-title">{action.label}</span>
              <span className="quick-action-meta">{action.meta}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
