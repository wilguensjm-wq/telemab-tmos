import { useEffect, useMemo, useState } from "react";
import logo from "../../assets/tmos-telemab.png";
import SidebarNav from "../dashboard/SidebarNav";
import TopBar from "../dashboard/TopBar";

const sidebarItems = [
  { label: "Operations Dashboard", icon: "◉" },
  { label: "Access & Security", icon: "⎈" },
  { label: "Operator Accounts", icon: "◎" },
  { label: "Master Control", icon: "▣" },
  { label: "Media Ingest", icon: "◫" },
  { label: "Playout Scheduler", icon: "◌" },
  { label: "Streaming Delivery", icon: "⬢" },
  { label: "Operational AI", icon: "✦" },
  { label: "Audience & Service KPIs", icon: "◍" },
  { label: "Station Controls", icon: "⚙" },
];

export default function AppLayout({
  activeModule,
  onNavigate,
  onLogout,
  children,
  pageTitle,
  pageSubtitle,
  quickStatus,
  userName = "Operator",
  userRole = "TMOS User",
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    [now],
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now],
  );

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="TMOS logo" className="sidebar-logo" />
          <div>
            <p className="brand-title">TMOS</p>
            <p className="brand-subtitle">Operations Center</p>
          </div>
        </div>

        <SidebarNav items={sidebarItems.map((item) => ({ ...item, active: item.label === activeModule }))} onSelect={onNavigate} />

        <div className="sidebar-footer">
          <p className="sidebar-footer-title">Broadcast status</p>
          <p className="sidebar-footer-text">{quickStatus || "Status unavailable."}</p>
          <button type="button" className="ghost-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <TopBar
          userName={userName}
          role={userRole}
          dateLabel={formattedDate}
          timeLabel={formattedTime}
          onSearch={() => {}}
          onNotify={() => {}}
        />

        <section className="hero-panel">
          <div>
            <p className="eyebrow">TMOS Enterprise Platform</p>
            <h1>{pageTitle}</h1>
            <p className="hero-copy">{pageSubtitle}</p>
          </div>
          <div className="hero-badge">
            <span className="hero-dot" />
            Secure orchestration active
          </div>
        </section>

        <div className="module-page">{children}</div>
      </main>
    </div>
  );
}
