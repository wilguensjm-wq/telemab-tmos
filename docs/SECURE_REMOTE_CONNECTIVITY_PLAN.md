# Secure Remote Connectivity Plan (TMOS)

Status: Proposed for implementation
Scope: TMOS backend gateway, Proxmox, Ubuntu, Docker, Portainer, future infrastructure services
Last updated: 2026-07-16

## 1) Architecture Fit (TMOS Standards)

This plan preserves TMOS backend-only gateway architecture:

- Frontend still talks only to TMOS backend.
- TMOS backend talks to providers over private VPN-only paths.
- No provider management API is exposed directly to public Internet.

Mandatory flow remains:

Frontend -> TMOS Backend API -> Provider APIs (over private VPN)

## 2) Recommended Technology

Primary recommendation: Tailscale (WireGuard-based) with subnet routers.

Why this fits best for your environment:

- Supports site-to-site connectivity between studios via subnet routing.
- Supports roaming operator access (hotel Wi-Fi, field laptops, remote control rooms) with device identity and MFA.
- Encrypted by default (WireGuard) with modern key rotation.
- Fast rollout compared with traditional IPsec hub-spoke only designs.
- Scales cleanly to additional studios by advertising routes from each new site router.

Alternative for full self-hosted control:

- Headscale + WireGuard clients (more operational overhead, no vendor control plane).

## 3) Target Network Topology

```mermaid
flowchart LR
  subgraph Internet
    OP[Authorized Operator Devices\nLaptops / Remote Studios]
  end

  subgraph Tailnet[Private Tailnet Overlay]
    TMOS[TMOS Backend Host\n(tag:tmos-backend)]
    HQR[HQ Subnet Router\n(tag:site-hq)]
    R1[Remote Studio Router A\n(tag:site-studio-a)]
    R2[Remote Studio Router B\n(tag:site-studio-b)]
  end

  subgraph HQ[Primary Site LAN]
    PX[Proxmox API 8006]
    UB[Ubuntu Servers SSH/API]
    DK[Docker Hosts]
    PT[Portainer 9443]
  end

  subgraph StudioA[Remote Site A LAN]
    SA[Future Infra]
  end

  OP --> Tailnet
  TMOS --> HQR
  HQR --> PX
  HQR --> UB
  HQR --> DK
  HQR --> PT
  TMOS --> R1
  TMOS --> R2
  R1 --> SA
```

Design notes:

- Run Tailscale on TMOS backend host (or backend VM host).
- Run one subnet router per site (HQ + each studio).
- Do not run provider APIs on public IPs.
- Reach providers through site-local private subnets routed over tailnet.

## 4) Authentication and Authorization Model

Identity:

- Enforce SSO (Google/Microsoft/Okta) + MFA for users.
- Require device approval for operator endpoints.

Machine auth:

- Use tagged auth keys for servers (`tag:tmos-backend`, `tag:site-hq`, `tag:site-studio-*`).
- Disable reusable long-lived keys where possible.

Network authorization:

- Tailscale ACL policy restricts:
  - who can access TMOS UI/API,
  - TMOS backend to provider ports only,
  - operators cannot directly access provider APIs unless explicitly allowed for break-glass admin.

## 5) Firewall and Exposure Policy

Edge/WAN policy (all sites):

- Default deny inbound from Internet.
- No direct inbound to management services:
  - Proxmox 8006
  - SSH 22
  - Docker daemon
  - Portainer 9443

Host-level policy:

- Allow provider management ports only from `tailscale0` or trusted LAN source ranges.
- Restrict TMOS backend egress to required provider endpoints/ports.

Example baseline (conceptual):

- Proxmox host: allow 8006 from HQ subnet router + TMOS backend tailnet identity.
- Ubuntu hosts: allow 22 only from TMOS backend and approved admin tag.
- Portainer: allow 9443 only from TMOS backend / admin tag.

## 6) Scalability Model (Future Studios)

Adding a new studio requires:

1. Deploy one subnet router at new site.
2. Advertise new site subnet routes.
3. Approve routes in admin console.
4. Add ACL entries for `tag:site-studio-x`.
5. Register new providers in TMOS backend using private subnet addresses.

No redesign of core topology required.

## 7) Implementation Phases

### Phase 1: Foundation (HQ)

1. Install Tailscale on TMOS backend host.
2. Install Tailscale on HQ subnet router host.
3. Advertise HQ LAN routes from HQ router.
4. Approve routes and disable key expiry for infrastructure nodes only if needed.
5. Enforce ACL baseline.

Validation:

- TMOS backend can reach Proxmox/Ubuntu/Docker/Portainer over private routed addresses.
- WAN scans show provider ports closed publicly.

### Phase 2: Roaming Operators

1. Enroll operator devices into tailnet.
2. Enforce MFA and device approval.
3. Grant access to TMOS frontend/backend only (not raw provider APIs by default).

Validation:

- Operator can log in from external network and reach TMOS securely.

### Phase 3: Additional Studios

1. Deploy per-site subnet routers.
2. Add route advertisements and ACL rules.
3. Add new provider endpoints in TMOS backend using private routed addresses.

Validation:

- TMOS manages multi-site infrastructure from one operations pane.

## 8) Suggested ACL Baseline (Tailscale)

Use as a starting template, then tighten per environment.

```json
{
  "tagOwners": {
    "tag:tmos-backend": ["autogroup:admin"],
    "tag:site-hq": ["autogroup:admin"],
    "tag:site-studio": ["autogroup:admin"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:tmos-backend:443,8081,5173"]
    },
    {
      "action": "accept",
      "src": ["tag:tmos-backend"],
      "dst": [
        "10.10.0.0/16:22,80,443,8006,9443",
        "10.20.0.0/16:22,80,443,8006,9443"
      ]
    },
    {
      "action": "accept",
      "src": ["autogroup:admin"],
      "dst": ["*:*"]
    }
  ]
}
```

## 9) Immediate Implementation Tasks for TMOS Repo/Runtime

1. Confirm production provider endpoints use private/VPN addresses only.
2. Add a deployment checklist for VPN prerequisites before enabling any new connector.
3. Add health probes that fail closed when provider endpoint resolves to public WAN unintentionally.
4. Add audit field `networkPath` (`tailnet`, `lan`, `unknown`) for provider actions.

## 10) Decision

Recommended production path:

- Use Tailscale (WireGuard) for both site connectivity and roaming operator connectivity.
- Keep TMOS as centralized backend gateway.
- Enforce zero-trust ACL + MFA + device approval.
- Expand through per-site subnet routers without redesign.
