export default function PageSection({ title, subtitle, children }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle ? <p className="panel-caption">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
