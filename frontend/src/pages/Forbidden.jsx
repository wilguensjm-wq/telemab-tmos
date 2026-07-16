import { Link } from "react-router-dom";

export default function Forbidden() {
  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: "center" }}>
        <p className="eyebrow">403</p>
        <h1 style={{ margin: "0 0 10px" }}>Access restricted</h1>
        <p className="brand-subtitle">Your role does not have access to this TMOS module.</p>
        <Link to="/dashboard" className="submit-btn" style={{ display: "inline-block", textDecoration: "none", marginTop: 18 }}>
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
