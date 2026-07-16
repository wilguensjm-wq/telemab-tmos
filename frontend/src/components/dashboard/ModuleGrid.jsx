export default function ModuleGrid({ items }) {
  if (items.length === 0) {
    return (
      <section className="module-grid">
        <article className="module-card module-empty-card">
          <h3>Platform Ready for Integration</h3>
          <p>Waiting for live provider data.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="module-grid">
      {items.map((item) => (
        <article key={item.label} className="module-card">
          <div className="module-card-icon">{item.icon}</div>
          <div>
            <h3>{item.label}</h3>
            <p>{item.description}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
