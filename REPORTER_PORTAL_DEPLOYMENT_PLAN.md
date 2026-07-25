# TMOS Reporter Portal - Deployment Plan

**Objective:** Enable external reporters to connect via `https://reporter.telemab.com` with camera and microphone access to join LiveKit sessions in the control room.

**Milestone 1 (This Document):** An authenticated reporter outside the network can:
1. Open `https://reporter.telemab.com`
2. Authenticate with credentials
3. Allow camera and microphone access
4. Click "Connect" 
5. Appear as a participant in the TMOS Control Room

**Timeline:** 3-5 days (infrastructure + frontend + testing)

---

## Phase 1: Infrastructure & HTTPS Setup (Day 1-2)

### 1.1 SSL Certificate Configuration

**Current State:** No TLS certificates configured  
**Goal:** Obtain wildcard certificate for *.telemab.com

**Implementation:**

```bash
# Option A: Let's Encrypt (Recommended - Free & Automatic)
# Nginx Proxy Manager will handle this automatically via ACME

# Option B: Self-signed (Development Only)
# FOR TESTING ONLY - NOT PRODUCTION
openssl req -x509 -newkey rsa:4096 -keyout tmos.key -out tmos.crt -days 365 -nodes

# Certificate paths in production:
/etc/letsencrypt/live/telemab.com/fullchain.pem
/etc/letsencrypt/live/telemab.com/privkey.pem
```

**Docker Compose Volume Mapping:**
```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt  # Let's Encrypt certs
  - ./nginx-config:/config              # Nginx Proxy Manager config
```

---

### 1.2 Nginx Proxy Manager Configuration

**Current State:** Empty `/nginx/` folder  
**Goal:** Reverse proxy with SSL termination and domain routing

**Required Files:**

**File: `docker-compose.yml` (updated)**
```yaml
services:
  postgres:
    # ... existing postgres service ...

  nginx-proxy-manager:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'      # HTTP (for Let's Encrypt challenges)
      - '443:443'    # HTTPS
      - '81:81'      # Admin UI (http://localhost:81)
    environment:
      DB_MYSQL_HOST: postgres
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: npm_secure_password
      DB_MYSQL_NAME: npm
    volumes:
      - ./nginx-data:/data
      - ./nginx-letsencrypt:/etc/letsencrypt
    depends_on:
      - postgres
    networks:
      - tmos-network

  backend:
    # ... existing backend ...
    environment:
      # Add trust proxy for Nginx headers
      NODE_TRUST_PROXY: 1
      TMOS_PUBLIC_URL: https://telemab.com
      TMOS_REPORTER_URL: https://reporter.telemab.com
    depends_on:
      - postgres
      - nginx-proxy-manager
    networks:
      - tmos-network

  frontend:
    # ... existing frontend ...
    depends_on:
      - backend
    networks:
      - tmos-network

networks:
  tmos-network:
    driver: bridge
```

**Step 1: Create Nginx Configuration Files**

**File: `nginx-config/conf/nginx.conf`**
```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
  worker_connections 4096;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" '
                  '"$http_user_agent" "$http_x_forwarded_for"';

  access_log /var/log/nginx/access.log main;

  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  types_hash_max_size 2048;
  client_max_body_size 20M;

  # Gzip compression
  gzip on;
  gzip_vary on;
  gzip_proxied any;
  gzip_comp_level 6;
  gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
  limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
  limit_req_zone $binary_remote_addr zone=websocket_limit:10m rate=1r/s;

  # Upstream backend
  upstream backend {
    server backend:8081;
    keepalive 32;
  }

  # HTTP to HTTPS redirect
  server {
    listen 80;
    server_name telemab.com *.telemab.com;
    return 301 https://$server_name$request_uri;
  }

  # Main TMOS Control Room (admin)
  server {
    listen 443 ssl http2;
    server_name telemab.com;

    ssl_certificate /etc/letsencrypt/live/telemab.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/telemab.com/privkey.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), payment=()" always;

    # Frontend (React app)
    location / {
      proxy_pass http://frontend:5173;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
      limit_req zone=api_limit burst=20 nodelay;
      
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
    }

    # WebSocket (Presence Gateway)
    location /ws/ {
      limit_req zone=websocket_limit burst=5 nodelay;
      
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "Upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
    }
  }

  # Reporter Portal (external)
  server {
    listen 443 ssl http2;
    server_name reporter.telemab.com;

    ssl_certificate /etc/letsencrypt/live/telemab.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/telemab.com/privkey.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self)" always;

    # CORS for reporter portal
    add_header 'Access-Control-Allow-Origin' 'https://reporter.telemab.com' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Correlation-ID' always;
    add_header 'Access-Control-Max-Age' '86400' always;

    if ($request_method = 'OPTIONS') {
      return 204;
    }

    # Frontend Reporter Portal
    location / {
      # Route to same frontend but with reporter query param
      proxy_pass http://frontend:5173;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API (with rate limiting)
    location /api/ {
      limit_req zone=api_limit burst=20 nodelay;
      
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
    }

    # WebSocket Secure (WSS) for LiveKit
    location /ws/ {
      limit_req zone=websocket_limit burst=5 nodelay;
      
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "Upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }
  }

  # Redirect www to non-www
  server {
    listen 443 ssl http2;
    server_name www.telemab.com;
    ssl_certificate /etc/letsencrypt/live/telemab.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/telemab.com/privkey.key;
    return 301 https://telemab.com$request_uri;
  }
}
```

---

## Phase 2: CORS Configuration (Backend)

### 2.1 Add CORS Middleware

**File: `backend/src/middleware/corsMiddleware.js` (NEW)**
```javascript
const allowedOrigins = {
  'https://telemab.com': true,           // Control room
  'https://reporter.telemab.com': true,  // Reporter portal
  'http://localhost:5173': true,         // Frontend dev
  'http://localhost:3000': true,         // Alternative dev
};

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (allowedOrigins[origin]) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-ID');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}
```

**File: `backend/src/middleware/securityHeadersMiddleware.js` (NEW)**
```javascript
export function securityHeadersMiddleware(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature permissions (camera, mic, geolocation)
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');

  // HSTS (only if HTTPS)
  if (req.protocol === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}
```

**File: `backend/src/app.js` (MODIFIED)**
```javascript
import { corsMiddleware } from "./middleware/corsMiddleware.js";
import { securityHeadersMiddleware } from "./middleware/securityHeadersMiddleware.js";

export function createApp({ ... }) {
  const app = express();
  
  // Security middleware (FIRST - before routes)
  app.use(securityHeadersMiddleware);
  app.use(corsMiddleware);
  
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(requestLogger);
  
  // ... rest of app.js
}
```

---

## Phase 3: WebSocket/WSS Configuration

### 3.1 Backend WebSocket Setup (Already Implemented)

**Current:** `backend/src/realtime/presenceGateway.js` uses WebSocket server  
**What works:**
- ✅ WebSocket server attached to HTTP server
- ✅ Authentication via Bearer token
- ✅ Heartbeat monitoring (10s)
- ✅ Broadcast of presence events

**No changes needed.** Nginx proxy will automatically upgrade WebSocket connections.

### 3.2 Frontend WebSocket Configuration

**File: `frontend/src/services/websocketService.js` (NEW)**
```javascript
export class WebSocketService {
  constructor({ baseUrl = null } = {}) {
    this.baseUrl = baseUrl || this.#getWebSocketUrl();
    this.ws = null;
    this.listeners = new Map();
    this.heartbeatInterval = null;
  }

  #getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  async connect(token) {
    return new Promise((resolve, reject) => {
      try {
        const url = `${this.baseUrl}?token=${encodeURIComponent(token)}`;
        this.ws = new WebSocket(url);

        this.ws.addEventListener('open', () => {
          console.log('[WebSocket] Connected');
          this.#startHeartbeat();
          resolve();
        });

        this.ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            this.#notifyListeners(data.type, data);
          } catch (error) {
            console.error('[WebSocket] Parse error:', error);
          }
        });

        this.ws.addEventListener('close', () => {
          console.log('[WebSocket] Disconnected');
          this.#stopHeartbeat();
        });

        this.ws.addEventListener('error', (error) => {
          console.error('[WebSocket] Error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);

    return () => {
      this.listeners.get(type).delete(callback);
    };
  }

  #notifyListeners(type, data) {
    if (!this.listeners.has(type)) return;
    for (const callback of this.listeners.get(type)) {
      callback(data);
    }
  }

  #startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30 seconds
  }

  #stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  disconnect() {
    this.#stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

---

## Phase 4: Authentication Flow for Reporters

### 4.1 Reporter Login Page

**File: `frontend/src/pages/ReporterLogin.jsx` (NEW)**
```javascript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import ReporterLogo from "../assets/reporter-portal-logo.png";

export default function ReporterLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login({ username, password, rememberMe });
      if (result?.user) {
        navigate("/reporter/studio", { replace: true });
      }
    } catch (error) {
      setError(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reporter-login-container">
      <div className="reporter-login-card">
        <img src={ReporterLogo} alt="TMOS Reporter" className="reporter-logo" />
        <h1>Reporter Portal</h1>
        <p className="subtitle">Enter your credentials to connect</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>

          <button type="submit" disabled={loading} className="login-button">
            {loading ? "Connecting..." : "Connect Now"}
          </button>
        </form>

        <div className="permission-info">
          <h4>Camera & Microphone Access</h4>
          <p>You'll be asked to allow access to your camera and microphone on the next screen.</p>
        </div>
      </div>
    </div>
  );
}
```

### 4.2 Reporter Studio Page (Camera/Mic Permissions)

**File: `frontend/src/pages/ReporterStudio.jsx` (NEW)**
```javascript
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { mediaService } from "../services/mediaService";
import LiveKitRoomManager from "../components/livekit/LiveKitRoomManager";

export default function ReporterStudio() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState({ camera: null, microphone: null });
  const [error, setError] = useState("");
  const videoRef = useRef();

  // Request camera and microphone permissions
  useEffect(() => {
    async function requestPermissions() {
      try {
        // Request camera
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setPermissions((prev) => ({ ...prev, camera: true }));
        
        // Request microphone
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermissions((prev) => ({ ...prev, microphone: true }));

        // Stop streams (just for permission check)
        cameraStream.getTracks().forEach((track) => track.stop());
        micStream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        setError(`Permission denied: ${error.message}`);
        if (error.name === "NotAllowedError") {
          setPermissions({ camera: false, microphone: false });
        }
      }
    }

    requestPermissions();
  }, []);

  const handleJoinRoom = async (roomData) => {
    if (!permissions.camera || !permissions.microphone) {
      setError("Camera and microphone permissions are required");
      return;
    }

    try {
      // Create media session through backend
      const session = await mediaService.createManagedSession({
        actor: user?.username,
        user,
        payload: {
          roomName: roomData.roomName,
          participantRole: "reporter",
          participantIdentity: user?.username,
        },
      });

      // Get LiveKit token
      const token = await mediaService.getSessionToken({
        sessionId: session.id,
        participantIdentity: user?.username,
      });

      // Join LiveKit room
      // ... LiveKit integration code
    } catch (error) {
      setError(`Failed to join: ${error.message}`);
    }
  };

  return (
    <div className="reporter-studio">
      <div className="studio-header">
        <h1>Welcome, {user?.name || "Reporter"}</h1>
        <p>Preparing to connect to TMOS Control Room</p>
      </div>

      <div className="permissions-check">
        <div className={`permission-item ${permissions.camera === true ? "granted" : "pending"}`}>
          <span className="icon">📷</span>
          <div>
            <strong>Camera</strong>
            <p>
              {permissions.camera === true && "✓ Permission granted"}
              {permissions.camera === false && "✗ Permission denied"}
              {permissions.camera === null && "⏳ Requesting permission..."}
            </p>
          </div>
        </div>

        <div className={`permission-item ${permissions.microphone === true ? "granted" : "pending"}`}>
          <span className="icon">🎤</span>
          <div>
            <strong>Microphone</strong>
            <p>
              {permissions.microphone === true && "✓ Permission granted"}
              {permissions.microphone === false && "✗ Permission denied"}
              {permissions.microphone === null && "⏳ Requesting permission..."}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {permissions.camera && permissions.microphone && (
        <LiveKitRoomManager
          onJoin={handleJoinRoom}
          identity={user?.username}
          roomName="tmos-control-room"
        />
      )}
    </div>
  );
}
```

---

## Phase 5: Frontend Routing Configuration

**File: `frontend/src/routes/index.jsx` (MODIFIED)**
```javascript
export const routes = [
  // Control Room routes (admin)
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/reporters", element: <Reporters /> },
      // ... other control room routes
    ],
  },

  // Reporter Portal routes
  {
    path: "/reporter",
    element: <ReporterLayout />,
    children: [
      { path: "/reporter/login", element: <ReporterLogin /> },
      { path: "/reporter/studio", element: <ReporterStudio /> },
      { path: "/reporter/preview", element: <ReporterPreview /> },
    ],
  },

  // Fallback redirects
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "*", element: <NotFound /> },
];
```

---

## Phase 6: Production Environment Variables

**File: `.env.production` (for backend)**
```env
# HTTPS/Public URLs
TMOS_PUBLIC_URL=https://telemab.com
TMOS_REPORTER_URL=https://reporter.telemab.com

# Trust proxy headers from Nginx
NODE_TRUST_PROXY=1
NODE_ENV=production
PORT=8081

# Database
TMOS_DATABASE_URL=postgres://prod_user:STRONG_PASSWORD@postgres:5432/tmos_prod
TMOS_DATABASE_SSL=true
TMOS_DATABASE_MAX_POOL=20

# Authentication
TMOS_JWT_SECRET=GENERATE_RANDOM_32_CHAR_KEY
TMOS_ADMIN_USER=admin
TMOS_ADMIN_PASS=STRONG_PASSWORD
TMOS_ACCESS_TOKEN_TTL=15m
TMOS_REFRESH_TOKEN_TTL=7d

# Providers
TMOS_PROVIDER_TIMEOUT_MS=10000

# LiveKit Configuration
TMOS_MEDIA_PROVIDER=livekit
TMOS_MEDIA_LIVEKIT_ENABLED=true
TMOS_MEDIA_LIVEKIT_WS_URL=wss://livekit.your-domain.com  # or ws://localhost:7880
TMOS_MEDIA_LIVEKIT_API_KEY=devkey
TMOS_MEDIA_LIVEKIT_API_SECRET=secret
TMOS_MEDIA_LIVEKIT_TOKEN_TTL_SECONDS=3600

# Proxmox Provider
PROXMOX_ENABLED=true
PROXMOX_URL=https://proxmox.internal.lan:8006
PROXMOX_TOKEN_ID=root@pam!tmos
PROXMOX_TOKEN_SECRET=SECURE_TOKEN
PROXMOX_TLS_STRICT=true
```

**File: `.env.production` (for frontend)**
```env
VITE_API_BASE_URL=https://telemab.com/api
VITE_WS_BASE_URL=wss://telemab.com/ws
VITE_REPORTER_API_URL=https://reporter.telemab.com/api
VITE_REPORTER_WS_URL=wss://reporter.telemab.com/ws
VITE_LIVEKIT_URL=wss://livekit.your-domain.com
VITE_NODE_ENV=production
```

---

## Phase 7: Docker Compose Updates

**File: `docker-compose.yml` (COMPLETE STRUCTURE)**
```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: tmos-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: tmos_prod
      POSTGRES_USER: tmos_user
      POSTGRES_PASSWORD: tmos_secure_password
    ports:
      - "5432:5432"
    volumes:
      - tmos_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tmos_user -d tmos_prod"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - tmos-network

  # Nginx Proxy Manager
  nginx-proxy-manager:
    image: jc21/nginx-proxy-manager:latest
    container_name: tmos-nginx
    restart: unless-stopped
    ports:
      - "80:80"      # HTTP (for Let's Encrypt)
      - "443:443"    # HTTPS
      - "81:81"      # Admin UI
    environment:
      DB_MYSQL_HOST: postgres
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: npm_secure_password
      DB_MYSQL_NAME: npm
    volumes:
      - ./nginx-data:/data
      - ./nginx-letsencrypt:/etc/letsencrypt
      - ./nginx-config/conf/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - postgres
    networks:
      - tmos-network

  # TMOS Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: tmos-backend
    restart: unless-stopped
    environment:
      # Loaded from .env.production
      TMOS_PUBLIC_URL: ${TMOS_PUBLIC_URL}
      TMOS_REPORTER_URL: ${TMOS_REPORTER_URL}
      NODE_ENV: ${NODE_ENV}
      PORT: ${PORT}
      TMOS_DATABASE_URL: ${TMOS_DATABASE_URL}
      TMOS_JWT_SECRET: ${TMOS_JWT_SECRET}
      TMOS_MEDIA_LIVEKIT_ENABLED: ${TMOS_MEDIA_LIVEKIT_ENABLED}
      TMOS_MEDIA_LIVEKIT_WS_URL: ${TMOS_MEDIA_LIVEKIT_WS_URL}
      TMOS_MEDIA_LIVEKIT_API_KEY: ${TMOS_MEDIA_LIVEKIT_API_KEY}
      TMOS_MEDIA_LIVEKIT_API_SECRET: ${TMOS_MEDIA_LIVEKIT_API_SECRET}
      NODE_TRUST_PROXY: 1
    ports:
      - "8081:8081"  # Only exposed to Nginx, not public
    volumes:
      - ./backend/src:/app/src
      - ./recordings:/app/recordings
    depends_on:
      postgres:
        condition: service_healthy
      nginx-proxy-manager:
        condition: service_started
    networks:
      - tmos-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # TMOS Frontend (React/Vite)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL}
        VITE_WS_BASE_URL: ${VITE_WS_BASE_URL}
        VITE_REPORTER_API_URL: ${VITE_REPORTER_API_URL}
        VITE_REPORTER_WS_URL: ${VITE_REPORTER_WS_URL}
    container_name: tmos-frontend
    restart: unless-stopped
    ports:
      - "5173:5173"  # Only exposed to Nginx
    depends_on:
      - backend
    networks:
      - tmos-network

  # LiveKit Server (Optional - for testing)
  # livekit:
  #   image: livekit/livekit-server:latest
  #   ports:
  #     - "7880:7880"
  #     - "7881:7881"
  #     - "7882:7882"
  #   volumes:
  #     - ./livekit-config.yaml:/etc/livekit.yaml
  #   networks:
  #     - tmos-network

networks:
  tmos-network:
    driver: bridge

volumes:
  tmos_postgres_data:
  tmos_livekit_data:
```

---

## Phase 8: Deployment Checklist

### Pre-Deployment (Local Testing)
- [ ] Test reporter login flow
- [ ] Verify camera/microphone permission prompts
- [ ] Test WebSocket connection (WSS over HTTPS)
- [ ] Verify LiveKit integration
- [ ] Check CORS headers for reporter.telemab.com
- [ ] Load test 10+ concurrent reporters

### Deployment Steps
1. [ ] Prepare production environment variables (.env.production)
2. [ ] Generate/obtain SSL certificates (Let's Encrypt)
3. [ ] Build Docker images: `docker-compose build`
4. [ ] Start services: `docker-compose up -d`
5. [ ] Configure Nginx Proxy Manager via admin UI (port 81)
6. [ ] Add DNS records:
   - `telemab.com` → Nginx IP
   - `reporter.telemab.com` → Nginx IP
   - `*.telemab.com` → Nginx IP (wildcard)
7. [ ] Verify HTTPS: `curl -v https://telemab.com`
8. [ ] Verify reporter portal: `curl -v https://reporter.telemab.com`

### Post-Deployment
- [ ] Monitor logs: `docker-compose logs -f backend`
- [ ] Check certificate renewal (Let's Encrypt)
- [ ] Set up automated backups of PostgreSQL
- [ ] Configure monitoring and alerting
- [ ] Test reporter connection from external network
- [ ] Document incident procedures

---

## Browser Compatibility & Camera/Microphone

### Supported Browsers
- Chrome/Chromium 90+
- Firefox 87+
- Safari 14.1+
- Edge 90+

### Camera/Microphone Permission Flow

**1. First Request:**
```
Reporter opens https://reporter.telemab.com
    ↓
Browser prompts: "Allow camera and microphone access?"
    ↓
Reporter clicks "Allow"
    ↓
Permissions stored in browser
```

**2. WebRTC Connection:**
```
Reporter connects → Backend creates LiveKit token
    ↓
LiveKit SDK opens local media streams
    ↓
Video/Audio transmitted to LiveKit server
    ↓
Appears in control room participant grid
```

**3. Code for Permission Handling:**
```javascript
// Check if browser supports getUserMedia
if (!navigator.mediaDevices?.getUserMedia) {
  showError("Your browser doesn't support camera/microphone access");
  return;
}

// Request permissions
try {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  
  // Permissions granted
  setPermissionsGranted(true);
  
  // Stop stream (will be re-acquired by LiveKit SDK)
  stream.getTracks().forEach(t => t.stop());
} catch (error) {
  if (error.name === "NotAllowedError") {
    showError("Camera/microphone permission denied");
  } else if (error.name === "NotFoundError") {
    showError("Camera/microphone not found on this device");
  }
}
```

---

## Security Considerations

### Firewall Rules (if using Docker on VPS)
```bash
# Allow HTTPS
sudo ufw allow 443/tcp

# Allow HTTP (for Let's Encrypt)
sudo ufw allow 80/tcp

# Block direct backend access
sudo ufw deny 8081/tcp

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp
```

### SSL/TLS Certificate Renewal
```bash
# Let's Encrypt certificates auto-renew via Nginx Proxy Manager
# Manual renewal (if needed):
sudo certbot renew --dry-run
sudo certbot renew
```

### Rate Limiting Rules
```
/auth/login: 5 attempts per 15 minutes per IP
/api/*: 100 requests per minute per authenticated user
/ws/*: 1 WebSocket connection per IP (monitored)
```

---

## Testing Checklist

### Unit Tests
- [ ] ReporterLogin authentication flow
- [ ] Permission request handling
- [ ] WebSocket connection/reconnection
- [ ] CORS header validation

### Integration Tests
- [ ] End-to-end reporter login
- [ ] Camera/mic permission flow
- [ ] LiveKit session creation
- [ ] Reporter appears in control room
- [ ] Producer can control reporter (mute/unmute)

### Load Tests
- [ ] 10 concurrent reporters connecting
- [ ] Sustained 1000 WebSocket messages/sec
- [ ] 5 minute stress test
- [ ] Recovery after provider timeout

### Security Tests
- [ ] HTTPS enforcement (no HTTP fallback)
- [ ] JWT token validation
- [ ] CORS headers on each domain
- [ ] Rate limiting enforcement
- [ ] Security headers present

---

## Troubleshooting

### Reporter can't connect
```bash
# Check backend connectivity
curl -v https://reporter.telemab.com/api/v1/health

# Check WebSocket
wscat -c wss://reporter.telemab.com/ws --auth "Bearer TOKEN"

# Check logs
docker-compose logs backend | grep reporter
```

### Camera/Microphone not working
```
1. Check browser permissions: Settings → Privacy → Camera/Microphone
2. Verify HTTPS (camera requires secure context)
3. Check browser console for MediaDevices errors
4. Try different browser
```

### LiveKit token issues
```bash
# Verify backend can create tokens
curl -X POST https://reporter.telemab.com/api/v1/media/sessions/token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","participantIdentity":"reporter-1"}'
```

---

## Deployment Timeline

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| 1 | SSL/Nginx setup | 2 hours | DevOps |
| 2 | CORS/Security headers | 1 hour | Backend |
| 3 | Reporter pages implementation | 3 hours | Frontend |
| 4 | LiveKit integration | 2 hours | Frontend |
| 5 | Docker build & deploy | 1 hour | DevOps |
| 6 | Testing & validation | 2 hours | QA |
| 7 | Production deployment | 1 hour | DevOps |
| **Total** | | **12 hours** | |

---

## Success Criteria (Milestone 1)

✅ Reporter can open `https://reporter.telemab.com`  
✅ Reporter authenticates with username/password  
✅ Browser prompts for camera and microphone permissions  
✅ Reporter clicks "Connect"  
✅ Reporter appears in Control Room participant grid  
✅ Producer can see/hear reporter  
✅ Producer can mute/unmute reporter  
✅ Reporter can see/hear control room (if applicable)  
✅ All connections use HTTPS/WSS (no plain HTTP/WS)  
✅ Security headers present on all responses  

---

## Next Steps

1. **Review & Approve** this deployment plan
2. **Phase 1:** Set up Nginx Proxy Manager and SSL certificates
3. **Phase 2:** Implement backend CORS and security headers
4. **Phase 3:** Create ReporterLogin and ReporterStudio pages
5. **Phase 4:** Test end-to-end reporter flow
6. **Phase 5:** Deploy to production

Ready to proceed?
