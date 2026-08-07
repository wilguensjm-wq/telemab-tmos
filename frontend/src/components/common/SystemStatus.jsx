import { useEffect, useRef, useState } from "react";
import APIClient from "../../api/APIClient";

// Parses "20260805.0030.abc1234" → "2026-08-05 00:30 UTC"
function parseBuildTime(version) {
  const m = String(version || "").match(/^(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})\./);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
}

export function useBackendHealth() {
  const [state, setState] = useState({ backendOk: false, dbOk: false, dbLatencyMs: null, checked: false });

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const res = await APIClient.get("/v1/health");
        const d = res?.data?.data || res?.data || {};
        if (mounted) {
          setState({
            backendOk: d.status === "ok" || d.status === "healthy",
            dbOk: d.database?.status === "ok" || d.database?.status === "healthy",
            dbLatencyMs: typeof d.database?.latencyMs === "number" ? d.database.latencyMs : null,
            checked: true,
          });
        }
      } catch {
        if (mounted) setState({ backendOk: false, dbOk: false, dbLatencyMs: null, checked: true });
      }
    };

    check();
    const id = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return state;
}

function Dot({ ok }) {
  return <span className={`sys-dot ${ok ? "ok" : "fail"}`}>●</span>;
}

export function SystemStatusBar({ health, livekitConnected }) {
  const internet = typeof navigator !== "undefined" ? navigator.onLine : true;
  return (
    <span className="sys-status-bar">
      <span className="sys-status-item"><Dot ok={health.backendOk} />Backend</span>
      <span className="sys-status-item"><Dot ok={livekitConnected} />LiveKit</span>
      <span className="sys-status-item"><Dot ok={health.dbOk} />Database</span>
      <span className="sys-status-item"><Dot ok={internet} />Internet</span>
    </span>
  );
}

export function SystemAboutModal({ version, health, livekitConnected, onClose }) {
  const overlayRef = useRef(null);
  const internet = typeof navigator !== "undefined" ? navigator.onLine : true;
  const buildTime = parseBuildTime(version);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Row = ({ label, value, cls }) => (
    <div className="about-row">
      <span className="about-label">{label}</span>
      <span className={`about-value${cls ? ` ${cls}` : ""}`}>{value}</span>
    </div>
  );

  const StatusRow = ({ label, ok }) => (
    <Row label={label} value={ok ? "Connected" : "Unreachable"} cls={ok ? "ok" : "fail"} />
  );

  return (
    <div
      className="about-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="about-modal" role="dialog" aria-modal="true" aria-label="TMOS System Info">
        <div className="about-header">
          <strong>TMOS</strong>
          <button type="button" className="about-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="about-body">
          <Row label="Version" value={version} cls="mono" />
          <Row label="Build Time" value={buildTime || "—"} />
          <Row label="Environment" value={import.meta.env.MODE === "production" ? "Production" : "Development"} />
          <div className="about-divider" />
          <StatusRow label="Backend" ok={health.backendOk} />
          <StatusRow label="LiveKit" ok={livekitConnected} />
          <StatusRow label="Database" ok={health.dbOk} />
          <StatusRow label="Internet" ok={internet} />
          {health.dbLatencyMs != null && <Row label="DB Latency" value={`${health.dbLatencyMs} ms`} />}
        </div>
      </div>
    </div>
  );
}
