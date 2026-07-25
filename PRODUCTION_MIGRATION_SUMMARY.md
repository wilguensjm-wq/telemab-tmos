# TeleMab TV Production Migration - Executive Summary

**Document:** PRODUCTION_DEPLOYMENT_ARCHITECTURE.md  
**Status:** Ready for Implementation  
**Timeline:** 5 weeks to production

---

## The Gap: Development vs. Production

### What We Have Now (Development)
```
Reporter ──[VPN Tailscale]──> 100.116.180.23:5173
                              (Unencrypted ws://)
                              No NAT traversal
```

### What We Need (Production)
```
Reporter ──[HTTPS Public]──> https://reporter.telemab.com
                              (Encrypted wss://)
                              Full NAT traversal (STUN/TURN)
                              No VPN required
```

---

## 5 Critical Missing Components

| Component | Current | Required | Impact if Missing |
|-----------|---------|----------|-------------------|
| **DNS** | None (IP-based) | reporter.telemab.com | Can't access from internet |
| **TLS/HTTPS** | None (HTTP only) | Let's Encrypt via Nginx | No encryption, security risk |
| **Reverse Proxy** | None | Nginx Proxy Manager | Can't route public traffic |
| **STUN/TURN** | None | Google STUN + TURN Relay | WebRTC fails on restricted networks |
| **Public Build** | Vite dev server | Static React build | Can't scale, not production-ready |

---

## Deployment Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  REPORTER (BROWSER)                 │
│          Opens: https://reporter.telemab.com        │
│          No VPN, No additional software             │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS 443 (Encrypted)
                         ▼
┌─────────────────────────────────────────────────────┐
│         NGINX PROXY MANAGER (TLS Termination)       │
│  • Public IP: 203.0.113.42                         │
│  • Certificates: Let's Encrypt (auto-renewed)      │
│  • Routes: /api → backend, / → frontend             │
└────┬─────────────────────────────────────────┬──────┘
     │ HTTP (Private Network)  │ Static Files
     ▼                         ▼
┌──────────────────┐   ┌─────────────────┐
│  BACKEND (8081)  │   │ REACT BUILD     │
│  • Express.js    │   │ • Served by Npm │
│  • RBAC          │   │ • SPA routing   │
│  • JWT auth      │   └─────────────────┘
└────┬─────────────┘
     │
     ▼
┌──────────────────┐   ┌─────────────────────────┐
│  LIVEKIT (7880)  │   │  DATABASE & PERSISTENCE │
│  • WebRTC SFU    │   │  • PostgreSQL           │
│  • STUN enabled  │   │  • Hourly backups       │
│  • TURN servers  │   │  • Automated failover   │
│  • UDP 50k-60k   │   └─────────────────────────┘
└──────────────────┘
```

---

## Week-by-Week Implementation Plan

### **Week 1-2: Infrastructure Preparation**
- [ ] Register domain (reporter.telemab.com)
- [ ] Deploy Nginx Proxy Manager
- [ ] Provision TLS certificates
- [ ] Update backend environment
- [ ] Configure LiveKit STUN/TURN

### **Week 3-4: Staging & Testing**
- [ ] Deploy full stack to staging
- [ ] Integration testing (all components)
- [ ] Security audit
- [ ] Performance testing
- [ ] Disaster recovery drill

### **Week 5: Production Rollout**
- [ ] Deploy to production (Monday AM)
- [ ] Smoke tests (Monday PM)
- [ ] Monitor metrics (Tue-Wed)
- [ ] User acceptance testing (Thu-Fri)

---

## Key Configuration Changes

### Frontend
```javascript
// BEFORE (Development)
VITE_API_BASE_URL=http://127.0.0.1:5173/api

// AFTER (Production)
VITE_API_BASE_URL=https://reporter.telemab.com/api
```

### Backend
```bash
# BEFORE (Development)
TMOS_MEDIA_LIVEKIT_WS_URL=ws://100.116.180.23:7880

# AFTER (Production)
TMOS_MEDIA_LIVEKIT_WS_URL=wss://reporter.telemab.com/ws/
```

### LiveKit
```yaml
# BEFORE (Development)
rtc:
  use_external_ip: false
  stun_servers: []        # None configured

# AFTER (Production)
rtc:
  use_external_ip: true
  stun_servers:
    - "stun:stun.l.google.com:19302"
  turn_servers:
    - urls: ["turn:turn.metered.ca:80"]
      username: "production-user"
      credential: "production-password"
```

---

## Cost Estimate

| Category | Monthly | Annual |
|----------|---------|--------|
| Cloud Infrastructure | $400-600 | $4,800-7,200 |
| TURN Server (Metered) | $300 | $3,600 |
| Monitoring & Logging | $50 | $600 |
| **Total Infrastructure** | **$750-950** | **$9,000-11,400** |
| Team (0.5 DevOps) | $4,800 | $57,600 |
| **Total w/ Staffing** | **$5,550-5,750** | **$66,600-69,000** |

**Cost Optimization Options:**
- Self-host TURN server (saves $200/mo)
- Use regional clouds (saves $100-200/mo)
- Combine with existing infra (saves $200+/mo)

---

## Success Metrics

### Before Production Cutover
- ✅ 100% of automated tests passing
- ✅ Performance within SLA (p95 < 200ms)
- ✅ Security audit completed
- ✅ Disaster recovery tested
- ✅ Team trained and ready

### After Production Cutover
- ✅ Reporters can join without VPN
- ✅ Camera/microphone working reliably
- ✅ HTTPS connection established
- ✅ LiveKit connections stable
- ✅ Zero data loss

---

## Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| DNS propagation delays | Medium | 48-hour lead time, TTL monitoring |
| TLS certificate issues | Low | Let's Encrypt auto-renewal, 30-day alerts |
| Database migration data loss | High | Backup verification, test restore |
| LiveKit WebRTC failures | High | STUN/TURN testing, fallback TURN servers |
| Reporter authentication issues | Medium | UAT testing, gradual rollout |

---

## Next Actions (This Week)

### For DevOps Team
1. [ ] Schedule infrastructure planning meeting
2. [ ] Identify cloud provider (DigitalOcean/AWS/Hetzner)
3. [ ] Create budget approval request
4. [ ] Register reporter.telemab.com domain

### For Backend Team
1. [ ] Review production .env template
2. [ ] Implement secrets manager integration
3. [ ] Add production deployment documentation
4. [ ] Update backend to support wss:// URLs

### For Frontend Team
1. [ ] Optimize production build (code splitting)
2. [ ] Test HTTPS/WSS connections
3. [ ] Verify SPA routing works behind proxy
4. [ ] Create deployment checklist

### For Product/QA Team
1. [ ] Develop UAT test plan
2. [ ] Create reporter user scenarios
3. [ ] Schedule security audit
4. [ ] Plan rollout communication

---

## Reference Documents

- **Full Architecture:** `docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md` (50+ pages)
- **Current State:** This file identifies 5 critical gaps
- **Network Topology:** `NETWORK_TOPOLOGY_ANALYSIS.md` (LAN architecture)
- **Deployment Checklist:** In PRODUCTION_DEPLOYMENT_ARCHITECTURE.md

---

## Questions & Support

**For DevOps questions:**
- Infrastructure sizing: See "Infrastructure Requirements" section
- Cost analysis: See "Cost Analysis" section
- Monitoring setup: See "Monitoring & Observability" section

**For Architecture questions:**
- Component interactions: See "Component-by-Component Migration"
- Database setup: See "Database Migration & Hardening"
- LiveKit config: See "LiveKit Production Configuration"

**For Timeline questions:**
- Detailed schedule: See "Detailed Migration Timeline"
- Critical path: DNS → Nginx PM → Full stack deployment
- Contingency: 2-week buffer built into plan

---

## Recommendation

**Proceed with production architecture implementation immediately.**

The current Tailscale-dependent development setup is not suitable for production broadcast platform. This plan provides:

✅ Zero-downtime migration path  
✅ Security-first design  
✅ Scalability foundation  
✅ Cost-optimized infrastructure  
✅ Comprehensive testing strategy  
✅ Disaster recovery capability  

**Expected outcome:** In 5 weeks, TeleMab TV will be a production-ready broadcast platform accessible to reporters anywhere on the internet, without VPN dependency or additional software installation.

---

**Document prepared:** 2026-07-25  
**Status:** Ready for implementation  
**Next milestone:** Week 1 infrastructure setup
