import logo from "../../assets/tmos-telemab.png";

export default function LoadingScreen() {
  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: "center", padding: "40px 32px" }}>
        <div className="brand-block">
          <img src={logo} alt="TMOS logo" className="brand-logo" style={{ width: 220 }} />
          <p className="eyebrow">Initializing TMOS</p>
          <p className="brand-subtitle">Preparing secure operations workspace…</p>
        </div>
      </div>
    </div>
  );
}
