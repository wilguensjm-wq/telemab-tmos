export default function SidebarNav({ items, onSelect }) {
  return (
    <nav className="sidebar-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`nav-item${item.active ? " active" : ""}`}
          onClick={() => onSelect?.(item.label)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
