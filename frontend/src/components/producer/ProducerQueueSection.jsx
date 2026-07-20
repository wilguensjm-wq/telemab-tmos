export default function ProducerQueueSection({ title, description, count, tone = "blue", children }) {
  return (
    <section className="panel producer-section">
      <div className="producer-section-header">
        <div>
          <h3 className="producer-section-title">{title}</h3>
          <p className="producer-section-description">{description}</p>
        </div>

        <span className={`producer-section-count tone-${tone}`}>{count}</span>
      </div>

      <div className="producer-section-body">{children}</div>
    </section>
  );
}