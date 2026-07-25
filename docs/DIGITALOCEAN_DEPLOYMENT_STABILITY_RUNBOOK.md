# TMOS DigitalOcean Deployment and Stability Runbook

Status: Stability Validation Mode
Date: 2026-07-25

## 1. Scope

This runbook deploys the current TMOS build for real-world reporter validation.

Mandatory rollout rule:
- Do not deploy directly to the live TeleMab TV production server for first validation.
- First deploy to staging and validate end-to-end.
- Promote the same validated configuration to production only after all gates pass.

Out of scope:
- New product features
- UI redesign
- Program Switcher enhancements beyond bug fixes

## 2. Architecture Target

- Reporter and Producer access: public internet only
- Staging reporter frontend: https://reporter-staging.<your-domain>
- Staging producer frontend: https://producer-staging.<your-domain>
- Staging backend API: https://reporter-staging.<your-domain>/api
- Staging LiveKit signaling: wss://reporter-staging.<your-domain>/ws
- Production reporter frontend: https://reporter.<your-domain>
- Production producer frontend: https://producer.<your-domain>
- RTC media transport: UDP 50000-60000 (public)
- TURN relay: coturn on public host

## 3. Files Added for Deployment

- ops/digitalocean/docker-compose.infra.yml
- ops/digitalocean/livekit.yaml.template
- ops/digitalocean/backend.env.production.template
- ops/digitalocean/templates/nginx-reporter.telemab.com.conf
- ops/digitalocean/templates/tmos-backend.service
- ops/digitalocean/preflight.sh

Validation assets:
- docs/REMOTE_REPORTER_STABILITY_RUNBOOK.md
- docs/REMOTE_REPORTER_VALIDATION_LOG_TEMPLATE.csv

## 4. DigitalOcean Prerequisites

1. Create a Ubuntu 24.04 droplet (recommended: 4 vCPU, 8 GB RAM).
2. Attach a reserved public IP.
3. Create DNS records:
- reporter-staging.<your-domain> -> reserved public IP
- producer-staging.<your-domain> -> reserved public IP
- reporter.<your-domain> -> reserved public IP (only for promotion phase)
- producer.<your-domain> -> reserved public IP (only for promotion phase)
4. Open firewall inbound ports:
- 22/tcp (SSH)
- 80/tcp (HTTP)
- 443/tcp (HTTPS)
- 3478/tcp+udp (TURN)
- 5349/tcp (TURN TLS)
- 49160-49200/udp (TURN relay)
- 50000-60000/udp (LiveKit RTP)

## 5. Host Setup

Run as root or with sudo:

```bash
apt update && apt -y upgrade
apt -y install nginx certbot python3-certbot-nginx docker.io docker-compose-plugin nodejs npm
useradd -m -s /bin/bash tmos || true
mkdir -p /opt/tmos /etc/tmos
chown -R tmos:tmos /opt/tmos
```

## 6. Deploy TMOS Code

```bash
cd /opt
git clone <YOUR_REPO_URL> tmos
cd /opt/tmos
```

## 7. Configure Infrastructure Services

1. Create env file for infra compose (example values):

```bash
cat >/opt/tmos/ops/digitalocean/.infra.env <<'EOF'
POSTGRES_USER=tmos_user
POSTGRES_PASSWORD=replace_strong_password
TURN_SHARED_SECRET=replace_turn_secret
TURN_REALM=reporter-staging.<your-domain>
TURN_EXTERNAL_IP=<droplet_public_ip>
EOF
```

2. Render LiveKit config from template:
- Copy ops/digitalocean/livekit.yaml.template to ops/digitalocean/livekit.yaml
- Replace placeholders LIVEKIT_API_KEY, LIVEKIT_API_SECRET, TURN_PUBLIC_HOST, TURN_USERNAME, TURN_PASSWORD

3. Start infra stack:

```bash
cd /opt/tmos/ops/digitalocean
docker compose --env-file .infra.env -f docker-compose.infra.yml up -d
```

## 8. Configure Backend

1. Create backend env file from template:

```bash
cp /opt/tmos/ops/digitalocean/backend.env.production.template /etc/tmos/backend.env
```

2. Edit /etc/tmos/backend.env and set strong secrets and staging domain values first.

3. Install backend dependencies and start with systemd:

```bash
cd /opt/tmos/backend
npm ci
cp /opt/tmos/ops/digitalocean/templates/tmos-backend.service /etc/systemd/system/tmos-backend.service
systemctl daemon-reload
systemctl enable --now tmos-backend
systemctl status tmos-backend --no-pager
```

## 9. Build and Publish Frontend

```bash
cd /opt/tmos/frontend
npm ci
VITE_API_BASE_URL=/api npm run build
mkdir -p /var/www/tmos-frontend
rsync -av --delete dist/ /var/www/tmos-frontend/
```

## 10. Configure Nginx and TLS

1. Copy template and set domain:

```bash
cp /opt/tmos/ops/digitalocean/templates/nginx-reporter.telemab.com.conf /etc/nginx/sites-available/reporter.conf
sed -i 's/reporter.REPLACE_DOMAIN/reporter-staging.<your-domain>/g' /etc/nginx/sites-available/reporter.conf
sed -i 's/producer.REPLACE_DOMAIN/producer-staging.<your-domain>/g' /etc/nginx/sites-available/reporter.conf
ln -sf /etc/nginx/sites-available/reporter.conf /etc/nginx/sites-enabled/reporter.conf
nginx -t
systemctl reload nginx
```

2. Issue cert:

```bash
# Staging certificates (first)
certbot --nginx \
	-d reporter-staging.<your-domain> \
	-d producer-staging.<your-domain> \
	--agree-tos -m <ops-email> --redirect
```

## 11. Deployment Preflight

Run:

```bash
cd /opt/tmos
./ops/digitalocean/preflight.sh \
	reporter-staging.<your-domain> \
	producer-staging.<your-domain> \
	wss://reporter-staging.<your-domain>/ws
```

## 12. Phase Gates (System Administrator Flow)

### Phase 1: Server Health Gate

Validate on staging host before any reporter joins:
- Docker daemon is active.
- PostgreSQL container is healthy.
- LiveKit container is healthy.
- coturn container is up.
- backend systemd service is active.
- HTTPS responds for staging domains.
- preflight script passes.

Commands:

```bash
systemctl is-active docker
cd /opt/tmos/ops/digitalocean && docker compose -f docker-compose.infra.yml ps
systemctl is-active tmos-backend
curl -I https://reporter-staging.<your-domain>
curl -I https://producer-staging.<your-domain>
./ops/digitalocean/preflight.sh reporter-staging.<your-domain> producer-staging.<your-domain> wss://reporter-staging.<your-domain>/ws
```

If any check fails, fix it before moving forward.

### Phase 2: Producer Laptop Gate

From laptop, open only:
- https://producer-staging.<your-domain>

Do not run backend or LiveKit locally.

### Phase 3: First External Reporter Gate

Use your phone with Wi-Fi off (cellular data only):
- Open https://reporter-staging.<your-domain>
- Join as reporter.
- Confirm producer receives both video and audio.

Passing this gate proves public-internet contribution path is working.

### Phase 4: Expanded External Validation

After your own cellular test passes:
- Add one external tester from a different network.
- Then expand to different ISP/city/country scenarios.

## 13. Stability Validation Execution

Do not add features. Execute:
- docs/REMOTE_REPORTER_STABILITY_RUNBOOK.md
- Capture every run in docs/REMOTE_REPORTER_VALIDATION_LOG_TEMPLATE.csv

Minimum matrix:
- Reporter 1: Windows laptop on home Wi-Fi
- Reporter 2: Android phone on cellular data
- Reporter 3: Laptop on different ISP
- Producer: control room workstation

## 14. Go/No-Go Criteria

Go only if all are true:
- Reporters connect over public internet (no localhost/private IP/VPN dependency)
- Camera and microphone stable
- Producer receives audio/video for all reporters
- Reconnection recovers after temporary network interruption
- No critical frontend/backend errors during extended session

No-go if any criterion fails.

## 15. Promotion to Production

Promote only after all staging gates and validation pass:
1. Apply the same validated config values pattern to production domains.
2. Re-issue TLS for production domains.
3. Re-run preflight against production endpoints.
4. Execute at least one cellular reporter sanity test in production.

Production cert example:

```bash
certbot --nginx \
	-d reporter.<your-domain> \
	-d producer.<your-domain> \
	--agree-tos -m <ops-email> --redirect
```

## 16. Useful Commands

```bash
# Backend logs
journalctl -u tmos-backend -f

# Infra logs
cd /opt/tmos/ops/digitalocean
docker compose -f docker-compose.infra.yml logs -f livekit coturn postgres

# Nginx status
nginx -t && systemctl status nginx --no-pager
```
