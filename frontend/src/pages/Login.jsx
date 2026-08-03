import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/tmos-telemab.png";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();
  const { login, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get("username") || "").trim();
    const submittedPassword = String(formData.get("password") || "");

    // Keep state aligned with what the browser currently has (including autofill values).
    setUsername(submittedUsername);
    setPassword(submittedPassword);

    if (!submittedUsername) {
      setSubmitError("Username is required.");
      return;
    }

    if (!submittedPassword) {
      setSubmitError("Password is required.");
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      const result = await login({
        username: submittedUsername,
        password: submittedPassword,
        rememberMe,
      });
      if (result?.user || result?.accessToken) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setSubmitError(result?.error || "Sign in failed. Please try again.");
    } catch (error) {
      setSubmitError(error?.message || "Sign in failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
        }

        .login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px 90px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 16% 18%, rgba(70, 168, 255, 0.24), transparent 24%),
            radial-gradient(circle at 84% 8%, rgba(20, 96, 220, 0.3), transparent 26%),
            linear-gradient(135deg, #040b18 0%, #07162f 48%, #020813 100%);
          font-family: "Segoe UI", "Inter", Arial, sans-serif;
          color: #f3f7ff;
        }

        .login-shell::before,
        .login-shell::after {
          content: "";
          position: absolute;
          inset: auto;
          border-radius: 999px;
          filter: blur(80px);
          opacity: 0.48;
          animation: drift 18s ease-in-out infinite alternate;
          pointer-events: none;
        }

        .login-shell::before {
          width: 360px;
          height: 360px;
          top: -110px;
          left: -70px;
          background: rgba(49, 151, 255, 0.24);
        }

        .login-shell::after {
          width: 420px;
          height: 420px;
          bottom: -140px;
          right: -100px;
          background: rgba(0, 99, 242, 0.2);
          animation-duration: 22s;
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: min(100%, 520px);
          padding: 40px 36px 30px;
          border-radius: 28px;
          border: 1px solid rgba(132, 201, 255, 0.28);
          background: linear-gradient(145deg, rgba(7, 17, 35, 0.93), rgba(8, 26, 49, 0.9));
          box-shadow: 0 26px 80px rgba(0, 8, 24, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .brand-block {
          text-align: center;
          margin-bottom: 28px;
        }

        .brand-logo {
          width: 300px;
          max-width: 100%;
          height: auto;
          margin-bottom: 18px;
          filter: drop-shadow(0 16px 30px rgba(7, 98, 255, 0.26));
        }

        .eyebrow {
          margin: 0 0 8px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: #78c8ff;
        }

        .brand-subtitle {
          margin: 0;
          font-size: 0.97rem;
          line-height: 1.7;
          color: rgba(223, 236, 255, 0.77);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-label {
          font-size: 0.86rem;
          font-weight: 600;
          color: #a9c9ea;
          letter-spacing: 0.01em;
        }

        .field-input {
          width: 100%;
          border: 1px solid rgba(129, 191, 255, 0.24);
          background: rgba(3, 12, 28, 0.84);
          color: #f4f8ff;
          padding: 13px 15px;
          border-radius: 14px;
          font-size: 0.97rem;
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
        }

        .field-input::placeholder {
          color: rgba(168, 197, 232, 0.55);
        }

        .field-input:hover {
          border-color: rgba(91, 186, 255, 0.56);
          background-color: rgba(4, 16, 35, 0.9);
        }

        .field-input:focus {
          border-color: rgba(80, 187, 255, 0.95);
          box-shadow: 0 0 0 4px rgba(53, 152, 255, 0.18);
          transform: translateY(-1px);
          background-color: rgba(4, 16, 35, 0.95);
        }

        .form-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 4px;
          font-size: 0.9rem;
        }

        .checkbox-row {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #a8c5e8;
          cursor: pointer;
          user-select: none;
        }

        .checkbox-row input {
          accent-color: #2f8cff;
          width: 15px;
          height: 15px;
          cursor: pointer;
        }

        .link {
          color: #6fc4ff;
          text-decoration: none;
          transition: color 180ms ease, transform 180ms ease;
        }

        .link:hover {
          color: #9fdcff;
          transform: translateY(-1px);
        }

        .submit-btn {
          margin-top: 8px;
          border: none;
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #f2f7ff;
          background: linear-gradient(135deg, #2c91ff 0%, #0e60dc 55%, #0a3c87 100%);
          box-shadow: 0 16px 34px rgba(16, 123, 255, 0.3);
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
          position: relative;
          overflow: hidden;
        }

        .submit-btn::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0));
          opacity: 0.4;
          pointer-events: none;
          animation: pulseGlow 2.6s ease-in-out infinite;
        }

        .submit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 42px rgba(16, 123, 255, 0.38);
          filter: brightness(1.04);
        }

        .submit-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px rgba(53, 152, 255, 0.2), 0 20px 42px rgba(16, 123, 255, 0.38);
        }

        .status-row {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 18px;
          font-size: 0.9rem;
          color: #99cfff;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #39d98a;
          box-shadow: 0 0 0 4px rgba(57, 217, 138, 0.16);
          animation: pulse 1.8s ease-in-out infinite;
        }

        .version-info {
          margin-top: 10px;
          font-size: 0.84rem;
          color: rgba(183, 209, 242, 0.7);
          letter-spacing: 0.02em;
        }

        .page-footer {
          position: absolute;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1;
          width: min(94%, 820px);
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 0.84rem;
          color: rgba(211, 228, 255, 0.72);
          text-align: center;
          flex-wrap: wrap;
        }

        @keyframes drift {
          from {
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            transform: translate3d(22px, -24px, 0) scale(1.08);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.16);
            opacity: 0.82;
          }
        }

        @keyframes pulseGlow {
          0%,
          100% {
            opacity: 0.2;
            transform: translateX(-100%);
          }
          50% {
            opacity: 0.45;
            transform: translateX(100%);
          }
        }

        @media (max-width: 900px) {
          .login-card {
            width: min(100%, 500px);
            padding: 34px 28px 28px;
          }

          .brand-logo {
            width: 260px;
          }
        }

        @media (max-width: 640px) {
          .login-shell {
            padding: 18px 16px 32px;
          }

          .login-card {
            padding: 28px 22px 24px;
            border-radius: 22px;
          }

          .brand-logo {
            width: 220px;
          }

          .form-options {
            flex-direction: column;
            align-items: flex-start;
          }

          .page-footer {
            position: relative;
            bottom: auto;
            transform: none;
            margin-top: 20px;
            justify-content: center;
            width: 100%;
          }
        }
      `}</style>

      <div className="login-card">
        <div className="brand-block">
          <img className="brand-logo" src={logo} alt="TMOS logo" />
          <p className="eyebrow">Unified Ecosystem OS</p>
          <p className="brand-subtitle">
            Secure control for TELEMAP infrastructure, media pipelines, and AI operations.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span className="field-label">Username</span>
            <input
              className="field-input"
              type="text"
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
            />
          </label>

          <label className="field-group">
            <span className="field-label">Password</span>
            <input
              className="field-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>

          <div className="form-options">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe((value) => !value)}
              />
              Remember me
            </label>
            <a className="link" href="#">
              Forgot password?
            </a>
          </div>

          <button type="submit" className="submit-btn" disabled={loading || isSubmitting}>
            {loading || isSubmitting ? "Signing In..." : "Sign In"}
          </button>

          {submitError ? <p className="version-info">{submitError}</p> : null}
        </form>

        <div className="status-row">
          <span className="status-dot" />
          System Status Online
        </div>
        <div className="version-info">TMOS Platform v1.0 • Secure Session • TLS 1.3</div>
      </div>

      <footer className="page-footer">
        <span>TMOS Unified Platform v1.0</span>
        <span>TELEMAP Management Operating System</span>
        <span>© 2026 TELEMAB Technologies</span>
      </footer>
    </div>
  );
}
