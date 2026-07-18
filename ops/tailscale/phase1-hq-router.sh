#!/usr/bin/env bash
set -euo pipefail

# Phase 1: configure HQ subnet router node.
# Run this script on the designated HQ router host.

HQ_SUBNET="${1:-192.168.88.0/24}"

echo "[phase1] install tailscale (if missing)"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "[phase1] enable forwarding"
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv6.conf.all.forwarding=1

echo "[phase1] persistent forwarding settings"
sudo tee /etc/sysctl.d/99-tmos-forwarding.conf >/dev/null <<'EOF'
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
sudo sysctl --system >/dev/null

echo "[phase1] set operator and apply subnet-router identity"
sudo tailscale set --operator="$USER"
sudo tailscale up --advertise-tags=tag:site-hq --snat-subnet-routes=true --accept-routes --reset

echo "[phase1] advertise HQ subnet route: ${HQ_SUBNET}"
sudo tailscale set --advertise-routes="${HQ_SUBNET}"

echo "[phase1] complete - approve advertised route in admin console"
