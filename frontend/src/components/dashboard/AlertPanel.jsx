export default function AlertPanel({ alerts }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">Broadcast Alerts</h2>
          <p className="panel-caption">News, playout, and delivery notifications</p>
        </div>
      </div>

      <div className="alert-list">
        {alerts.length === 0 ? (
          <p className="panel-empty-message">No Data Available</p>
        ) : (
          alerts.map((alert) => (
            <article key={alert.title} className="alert-item">
              <span className="alert-severity">{alert.severity}</span>
              <p className="alert-title">{alert.title}</p>
              <p className="alert-detail">{alert.detail}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
