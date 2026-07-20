import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import logo from "../../assets/tmos-telemab.png";
import { useAuth } from "../../contexts/AuthContext";

const navTree = [
  { label: "Home", path: "/dashboard" },
  {
    label: "Infrastructure",
    children: [
      { label: "Proxmox", path: "/infrastructure/proxmox" },
      { label: "Ubuntu Servers", path: "/infrastructure/ubuntu" },
      { label: "Docker", path: "/infrastructure/docker" },
      { label: "Portainer", path: "/infrastructure/portainer" },
      { label: "Storage", path: "/infrastructure/storage" },
      { label: "Network", path: "/infrastructure/network" },
      { label: "DNS", path: "/infrastructure/dns" },
    ],
  },
  {
    label: "Broadcast",
    children: [
      { label: "Live Channels", path: "/broadcast/live-channels" },
      { label: "Streaming", path: "/broadcast/streaming" },
      { label: "RTMP", path: "/broadcast/rtmp" },
      { label: "HLS", path: "/broadcast/hls" },
      { label: "FFmpeg", path: "/broadcast/ffmpeg" },
      { label: "OBS Connections", path: "/broadcast/obs-connections" },
      { label: "Playout", path: "/broadcast/playout" },
    ],
  },
  {
    label: "Monitoring",
    children: [
      { label: "Uptime Kuma", path: "/monitoring/uptime-kuma" },
      { label: "Alerts", path: "/monitoring/alerts" },
      { label: "Performance", path: "/monitoring/performance" },
      { label: "Logs", path: "/monitoring/logs" },
      { label: "Incidents", path: "/monitoring/incidents" },
    ],
  },
  {
    label: "AI Operations",
    children: [
      { label: "AI Engineer", path: "/ai-operations/engineer" },
      { label: "AI Diagnostics", path: "/ai-operations/diagnostics" },
      { label: "AI Automation", path: "/ai-operations/automation" },
      { label: "Knowledge Base", path: "/ai-operations/knowledge-base" },
      { label: "Recommendations", path: "/ai-operations/recommendations" },
    ],
  },
  {
    label: "Reporter Control",
    children: [
      { label: "Reporters", path: "/reporter-control/reporters" },
      { label: "Producer", path: "/reporter-control/producer" },
      { label: "Studios", path: "/reporter-control/studios" },
      { label: "Assignments", path: "/reporter-control/assignments" },
      { label: "Presence", path: "/reporter-control/presence" },
    ],
  },
  { label: "Users", path: "/users" },
  { label: "Automation", path: "/automation" },
  { label: "Settings", path: "/settings" },
  { label: "Developer", path: "/developer" },
];

export default function AppShell() {
  const auth = useAuth();
  const user = auth?.user || null;
  const logout = auth?.logout || (() => {});
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`dashboard-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="TMOS logo" className="sidebar-logo" />
          {!collapsed && (
            <div>
              <p className="brand-title">TMOS</p>
              <p className="brand-subtitle">Operations Center</p>
            </div>
          )}
        </div>

        <button type="button" className="collapse-toggle" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? "›" : "‹"}
        </button>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navTree.map((node) => (
            <div key={node.label} className="nav-section">
              {node.path ? (
                <NavLink to={node.path} className={({ isActive }) => `nav-item nav-root-item${isActive ? " active" : ""}`}>
                  <span className="nav-icon">•</span>
                  {!collapsed && <span>{node.label}</span>}
                </NavLink>
              ) : null}

              {node.children ? (
                <>
                  {!collapsed && <p className="nav-parent-title">{node.label}</p>}
                  {node.children.map((item) => (
                    <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item nav-subitem${isActive ? " active" : ""}`}>
                      <span className="nav-icon">•</span>
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                </>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <>
              <p className="sidebar-footer-title">Signed in as</p>
              <p className="sidebar-footer-text">{user?.name || "TMOS Operator"}</p>
            </>
          )}
          <button type="button" className="ghost-button" onClick={logout}>
            {collapsed ? "↗" : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-search">
            <span className="search-icon">⌕</span>
            <input type="text" placeholder="Search TMOS workspace" />
          </div>

          <div className="topbar-meta">
            <div className="status-chip">
              <span className="status-dot small" />
              System status online
            </div>
            <div className="datetime-block">
              <span className="date-text">TELEMAP unified operations</span>
              <span className="time-text">TMOS v1.0</span>
            </div>
            <button type="button" className="icon-button">🔔</button>
            <div className="user-chip">
              <div className="avatar">{user?.name?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "TM"}</div>
              <div>
                <p className="user-name">{user?.name || "Operator"}</p>
                <p className="user-role">{user?.role || "Administrator"}</p>
              </div>
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
