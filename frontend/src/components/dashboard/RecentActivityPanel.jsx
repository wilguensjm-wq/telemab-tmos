export default function RecentActivityPanel({ items }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">Recent Station Activity</h2>
          <p className="panel-caption">Latest rundown, playout, and infrastructure updates</p>
        </div>
      </div>

      <div className="activity-list">
        {items.length === 0 ? (
          <p className="panel-empty-message">No Data Available</p>
        ) : (
          items.map((item) => (
            <article key={item.title} className="activity-item">
              <p className="activity-title">{item.title}</p>
              <p className="activity-desc">{item.desc}</p>
              <p className="panel-caption">{item.time}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
