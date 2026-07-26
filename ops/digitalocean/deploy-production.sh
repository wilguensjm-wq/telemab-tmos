#!/usr/bin/env bash
set -euo pipefail

REPORTER_DOMAIN="${REPORTER_DOMAIN:-reporter.telemab.com}"
PRODUCER_DOMAIN="${PRODUCER_DOMAIN:-producer.telemab.com}"
OPS_EMAIL="${OPS_EMAIL:-}"
REPO_ROOT="${REPO_ROOT:-/opt/tmos}"
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_ROOT/frontend}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/tmos-frontend}"
NGINX_TEMPLATE="${NGINX_TEMPLATE:-$REPO_ROOT/ops/digitalocean/templates/nginx-reporter.telemab.com.conf}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/reporter.conf}"
NGINX_ENABLED_LINK="${NGINX_ENABLED_LINK:-/etc/nginx/sites-enabled/reporter.conf}"
FORCE_REBUILD=false
SKIP_CERTBOT=false
DISABLE_DEFAULT=false

log_ok() {
  echo "[OK] $*"
}

log_warn() {
  echo "[WARN] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

log_step() {
  echo
  echo "== $* =="
}

usage() {
  cat <<'EOF'
Usage: deploy-production.sh [options]

Options:
  --reporter-domain <domain>    Reporter hostname (default: reporter.telemab.com)
  --producer-domain <domain>    Producer hostname (default: producer.telemab.com)
  --ops-email <email>           Email for certbot (required unless --skip-certbot)
  --repo-root <path>            Repo root path (default: /opt/tmos)
  --force-rebuild               Always run frontend build
  --skip-certbot                Skip certbot issuance step
  --disable-default-site        Disable /etc/nginx/sites-enabled/default after success
  -h, --help                    Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reporter-domain)
      REPORTER_DOMAIN="$2"
      shift 2
      ;;
    --producer-domain)
      PRODUCER_DOMAIN="$2"
      shift 2
      ;;
    --ops-email)
      OPS_EMAIL="$2"
      shift 2
      ;;
    --repo-root)
      REPO_ROOT="$2"
      FRONTEND_DIR="$REPO_ROOT/frontend"
      NGINX_TEMPLATE="$REPO_ROOT/ops/digitalocean/templates/nginx-reporter.telemab.com.conf"
      shift 2
      ;;
    --force-rebuild)
      FORCE_REBUILD=true
      shift
      ;;
    --skip-certbot)
      SKIP_CERTBOT=true
      shift
      ;;
    --disable-default-site)
      DISABLE_DEFAULT=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$EUID" -ne 0 ]]; then
  log_error "Run as root (or with sudo)."
  exit 1
fi

if [[ "$SKIP_CERTBOT" == false && -z "$OPS_EMAIL" ]]; then
  log_error "--ops-email is required unless --skip-certbot is set."
  exit 1
fi

if [[ ! -f "$NGINX_TEMPLATE" ]]; then
  log_error "Missing Nginx template: $NGINX_TEMPLATE"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
  log_error "Missing frontend directory: $FRONTEND_DIR"
  exit 1
fi

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

for cmd in nginx curl sed rsync tar awk find cmp; do
  check_cmd "$cmd"
done

log_step "Backup Nginx configuration"
backup_file="/root/nginx-backup-$(date +%F-%H%M%S).tar.gz"
tar -czf "$backup_file" /etc/nginx
log_ok "Created backup: $backup_file"

if [[ -f /etc/nginx/sites-available/default ]]; then
  default_backup="/etc/nginx/sites-available/default.bak.$(date +%F-%H%M%S)"
  cp /etc/nginx/sites-available/default "$default_backup"
  log_ok "Backed up default site: $default_backup"
else
  log_warn "No default site file at /etc/nginx/sites-available/default"
fi

log_step "Verify service health"
ss -ltnp | egrep ':8081|:7880|:5173' || true

backend_health="unhealthy"
if curl -fsS "http://127.0.0.1:8081/api/v1/health" >/tmp/tmos-backend-health.json; then
  backend_health="healthy"
  log_ok "Backend health endpoint reachable"
else
  log_error "Backend health endpoint failed at http://127.0.0.1:8081/api/v1/health"
  exit 1
fi

livekit_health="unhealthy"
if curl -fsSI "http://127.0.0.1:7880" >/tmp/tmos-livekit-head.txt; then
  livekit_health="healthy"
  log_ok "LiveKit endpoint reachable"
else
  log_error "LiveKit endpoint failed at http://127.0.0.1:7880"
  exit 1
fi

if curl -fsSI "http://127.0.0.1:5173" >/tmp/tmos-frontend-dev-head.txt; then
  log_ok "Dev frontend on 5173 is reachable (optional for production)"
else
  log_warn "Dev frontend on 5173 is not reachable (expected in static production mode)"
fi

log_step "Check existing frontend build artifacts"
ls -lah "$FRONTEND_DIR/dist" || true
ls -lah "$DEPLOY_DIR" || true

build_needed() {
  if [[ "$FORCE_REBUILD" == true ]]; then
    return 0
  fi

  if [[ ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
    return 0
  fi

  latest_src="$(find "$FRONTEND_DIR/src" -type f -printf '%T@\n' 2>/dev/null | sort -nr | head -n1 || true)"
  dist_index_ts="$(stat -c '%Y' "$FRONTEND_DIR/dist/index.html" 2>/dev/null || echo 0)"

  if [[ -n "$latest_src" ]]; then
    latest_src_int="${latest_src%.*}"
    if (( latest_src_int > dist_index_ts )); then
      return 0
    fi
  fi

  return 1
}

log_step "Build frontend only if necessary"
if build_needed; then
  log_warn "Frontend build is missing or stale; running npm run build"
  (
    cd "$FRONTEND_DIR"
    VITE_API_BASE_URL=/api npm run build
  )
  log_ok "Frontend build completed"
else
  log_ok "Frontend build is current; skipping npm run build"
fi

mkdir -p "$DEPLOY_DIR"
sync_output="$(rsync -av --delete --itemize-changes "$FRONTEND_DIR/dist/" "$DEPLOY_DIR/" || true)"
echo "$sync_output"
log_ok "Frontend files synced to $DEPLOY_DIR"

log_step "Verify deployed frontend files"
if [[ ! -f "$DEPLOY_DIR/index.html" ]]; then
  log_error "Missing $DEPLOY_DIR/index.html after sync"
  exit 1
fi
if [[ ! -d "$DEPLOY_DIR/assets" ]]; then
  log_error "Missing $DEPLOY_DIR/assets after sync"
  exit 1
fi
ls -lah "$DEPLOY_DIR"
log_ok "Deployed frontend files look valid"

log_step "Inspect and validate repository Nginx template"
cat "$NGINX_TEMPLATE"

if ! grep -q "server_name reporter.REPLACE_DOMAIN producer.REPLACE_DOMAIN;" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected server_name placeholder line"
  exit 1
fi
if ! grep -q "root /var/www/tmos-frontend;" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected root /var/www/tmos-frontend"
  exit 1
fi
if ! grep -q "proxy_pass http://127.0.0.1:8081/api/;" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected backend proxy /api -> 127.0.0.1:8081"
  exit 1
fi
if ! grep -Fq "location ^~ /ws/" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected /ws/ LiveKit location"
  exit 1
fi
if ! grep -Fq "rewrite ^/ws/(.*)$ /$1 break;" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected /ws/ prefix rewrite to /rtc path"
  exit 1
fi
if ! grep -Fq "proxy_pass http://127.0.0.1:7880;" "$NGINX_TEMPLATE"; then
  log_error "Template missing expected LiveKit proxy /ws -> 127.0.0.1:7880"
  exit 1
fi
log_ok "Template validation passed"

log_step "Render and install Nginx site idempotently"
tmp_rendered="$(mktemp)"
sed "s/reporter.REPLACE_DOMAIN/$REPORTER_DOMAIN/g; s/producer.REPLACE_DOMAIN/$PRODUCER_DOMAIN/g" "$NGINX_TEMPLATE" > "$tmp_rendered"

if [[ -f "$NGINX_SITE" ]]; then
  if cmp -s "$tmp_rendered" "$NGINX_SITE"; then
    log_ok "Nginx site already up to date: $NGINX_SITE"
  else
    site_backup="$NGINX_SITE.bak.$(date +%F-%H%M%S)"
    cp "$NGINX_SITE" "$site_backup"
    cp "$tmp_rendered" "$NGINX_SITE"
    log_ok "Updated $NGINX_SITE (backup: $site_backup)"
  fi
else
  cp "$tmp_rendered" "$NGINX_SITE"
  log_ok "Created $NGINX_SITE"
fi
rm -f "$tmp_rendered"

if [[ -L "$NGINX_ENABLED_LINK" ]]; then
  current_target="$(readlink -f "$NGINX_ENABLED_LINK")"
  desired_target="$(readlink -f "$NGINX_SITE")"
  if [[ "$current_target" == "$desired_target" ]]; then
    log_ok "Symlink already correct: $NGINX_ENABLED_LINK -> $NGINX_SITE"
  else
    ln -sfn "$NGINX_SITE" "$NGINX_ENABLED_LINK"
    log_ok "Updated symlink: $NGINX_ENABLED_LINK -> $NGINX_SITE"
  fi
else
  ln -sfn "$NGINX_SITE" "$NGINX_ENABLED_LINK"
  log_ok "Created symlink: $NGINX_ENABLED_LINK -> $NGINX_SITE"
fi

log_step "Validate and reload Nginx"
nginx -t
log_ok "nginx -t passed"
systemctl reload nginx
log_ok "Nginx reloaded"

log_step "Verify reporter host over local HTTP"
http_headers_file="/tmp/tmos-http-headers.txt"
http_body_file="/tmp/tmos-http-body.html"
curl -fsSI -H "Host: $REPORTER_DOMAIN" http://127.0.0.1 > "$http_headers_file"
curl -fsS -H "Host: $REPORTER_DOMAIN" http://127.0.0.1 > "$http_body_file"

if grep -q "TELE-MAB SERVER WORKING" "$http_body_file"; then
  log_error "Placeholder page still served for $REPORTER_DOMAIN"
  exit 1
fi
log_ok "Reporter host no longer serves placeholder page"

log_step "Install certbot if needed"
if command -v certbot >/dev/null 2>&1; then
  log_ok "certbot already installed"
else
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
  log_ok "Installed certbot and nginx plugin"
fi

log_step "Issue/refresh TLS certificates"
if [[ "$SKIP_CERTBOT" == true ]]; then
  log_warn "Skipping certbot by request (--skip-certbot)"
else
  getent hosts "$REPORTER_DOMAIN" >/dev/null || {
    log_error "Reporter domain does not resolve on this host: $REPORTER_DOMAIN"
    exit 1
  }
  getent hosts "$PRODUCER_DOMAIN" >/dev/null || {
    log_error "Producer domain does not resolve on this host: $PRODUCER_DOMAIN"
    exit 1
  }

  certbot --nginx \
    -d "$REPORTER_DOMAIN" \
    -d "$PRODUCER_DOMAIN" \
    --redirect \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring \
    -m "$OPS_EMAIL"
  log_ok "Certbot completed"
fi

if [[ "$DISABLE_DEFAULT" == true ]]; then
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
    log_ok "Disabled default site"
    nginx -t
    systemctl reload nginx
    log_ok "Reloaded Nginx after disabling default site"
  else
    log_ok "Default site already disabled"
  fi
else
  log_warn "Default site left enabled (expected unless --disable-default-site is set)"
fi

log_step "Final verification summary"
backend_summary="FAIL"
livekit_summary="FAIL"
nginx_summary="FAIL"
http_summary="FAIL"
https_reporter_summary="FAIL"
https_producer_summary="FAIL"
default_site_summary="disabled"

if curl -fsS "http://127.0.0.1:8081/api/v1/health" >/dev/null; then
  backend_summary="OK"
fi

if curl -fsSI "http://127.0.0.1:7880" >/dev/null; then
  livekit_summary="OK"
fi

if systemctl is-active --quiet nginx; then
  nginx_summary="active"
fi

if curl -fsSI -H "Host: $REPORTER_DOMAIN" http://127.0.0.1 >/dev/null; then
  http_summary="OK"
fi

if curl -fsSI "https://$REPORTER_DOMAIN" >/dev/null; then
  https_reporter_summary="OK"
fi

if curl -fsSI "https://$PRODUCER_DOMAIN" >/dev/null; then
  https_producer_summary="OK"
fi

if [[ -e /etc/nginx/sites-enabled/default ]]; then
  default_site_summary="enabled"
fi

echo "Backend health: $backend_summary"
echo "LiveKit health: $livekit_summary"
echo "Nginx status: $nginx_summary"
echo "HTTP check ($REPORTER_DOMAIN): $http_summary"
echo "HTTPS check ($REPORTER_DOMAIN): $https_reporter_summary"
echo "HTTPS check ($PRODUCER_DOMAIN): $https_producer_summary"
echo "Default site status: $default_site_summary"

if [[ "$DISABLE_DEFAULT" == false ]]; then
  echo "Manual step: remove /etc/nginx/sites-enabled/default after final external validation."
fi

if [[ "$SKIP_CERTBOT" == true ]]; then
  echo "Manual step: run certbot when ready:"
  echo "  certbot --nginx -d $REPORTER_DOMAIN -d $PRODUCER_DOMAIN --redirect --agree-tos -m $OPS_EMAIL"
fi

log_ok "Deployment script completed"