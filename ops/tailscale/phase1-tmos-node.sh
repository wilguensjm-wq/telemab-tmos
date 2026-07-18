#!/usr/bin/env bash
set -euo pipefail

# Phase 1: configure TMOS backend as a tailscale management gateway node.
# Requires root privileges.

HQ_SUBNET="${1:-192.168.88.0/24}"

echo "[phase1] setting operator to current user"
sudo tailscale set --operator="$USER"

echo "[phase1] tagging node as tmos backend and hq site"
sudo tailscale up --advertise-tags=tag:tmos-backend,tag:site-hq --accept-routes --reset

echo "[phase1] advertising HQ subnet route: ${HQ_SUBNET}"
sudo tailscale set --advertise-routes="${HQ_SUBNET}"

echo "[phase1] tailscale status summary"
tailscale status --json | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("BackendState="+j.BackendState);console.log("Node="+(j.Self?.DNSName||""));console.log("AdvertisedRoutes="+(j.AdvertisedRoutes||[]).join(","));});'

echo "[phase1] NOTE: route advertisement must be approved in Tailscale admin console."
