export default function TopBar({ userName, role, dateLabel, timeLabel, onSearch, onNotify }) {
  return (
    <header className="topbar">
      <div className="topbar-search">
        <span className="search-icon">⌕</span>
        <input type="text" placeholder="Search channels, users, alerts" onChange={onSearch} />
      </div>

      <div className="topbar-meta">
        <div className="datetime-block">
          <span className="date-text">{dateLabel}</span>
          <span className="time-text">{timeLabel}</span>
        </div>

        <button type="button" className="icon-button" onClick={onNotify} aria-label="Notifications">
          🔔
        </button>

        <div className="user-chip">
          <div className="avatar">AB</div>
          <div>
            <p className="user-name">{userName}</p>
            <p className="user-role">{role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
