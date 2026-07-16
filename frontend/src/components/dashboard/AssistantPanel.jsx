export default function AssistantPanel({ actions }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">Operational AI</h2>
          <p className="panel-caption">Recommended actions for master control and engineering</p>
        </div>
      </div>

      <div className="assistant-list">
        {actions.length === 0 ? (
          <p className="panel-empty-message">Waiting for Provider</p>
        ) : (
          actions.map((action) => (
            <div key={action} className="assistant-item">
              {action}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
