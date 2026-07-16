import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: "center" }}>
        <p className="eyebrow">404</p>
        <h1 style={{ margin: "0 0 10px" }}>Page not found</h1>
        <p className="brand-subtitle">The requested TMOS workspace resource could not be located.</p>
        <Link to="/dashboard" className="submit-btn" style={{ display: "inline-block", textDecoration: "none", marginTop: 18 }}>
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
