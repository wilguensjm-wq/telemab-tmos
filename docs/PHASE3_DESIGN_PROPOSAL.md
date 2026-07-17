# TMOS Phase 3 Design Proposal

Status: Proposal
Prepared: 2026-07-17
Precondition: Phase 2 (RBAC) closed

## 1. Goals

- Build on frozen v0.2 RBAC foundation.
- Improve operability, policy governance, and resilience.
- Preserve backend-only gateway model and centralized authorization.

## 2. Non-Goals

- No bypass of backend authorization.
- No direct frontend provider access.
- No ad hoc policy logic outside shared authorization services.

## 3. Proposed Phase 3 Workstreams

### A. RBAC Governance and Operability

- Add admin-only backend APIs for role assignment lifecycle.
- Add read-only introspection endpoint for route-permission matrix.
- Add RBAC drift reporting (catalog vs database mappings).
- Add audit analytics for denied-action trends.

### B. Reliability and Performance

- Introduce authorization decision caching with bounded TTL and deterministic invalidation.
- Add startup diagnostics endpoint that reports RBAC mapping integrity.
- Add load and latency benchmarks for authorization and audit paths.

### C. Security Hardening

- Add optional break-glass workflow with explicit audit reason requirements.
- Add stricter token/session revocation observability.
- Add policy-change approval logging (who changed what, when).

### D. Platform Data and Recovery Readiness

- Formalize backup schedule automation.
- Add restore verification script and post-restore checklist automation.
- Define data retention policy for sessions/audit/events.

## 4. Architecture Constraints (Must Hold)

- All enforcement remains in backend middleware/services.
- Authorization remains deterministic and reusable.
- Route-permission mapping remains explicit and startup-verified.
- All allow/deny decisions remain auditable with correlation IDs.

## 5. Candidate Milestones

1. Phase 3.1: RBAC admin APIs + observability endpoints
2. Phase 3.2: Authorization performance and caching controls
3. Phase 3.3: Security governance and backup/restore automation

## 6. Acceptance Criteria (Phase 3 Proposal)

- No regression in v0.2 RBAC validation suite.
- New RBAC governance endpoints protected by explicit permissions.
- Deterministic behavior under cache hit/miss scenarios.
- Recovery runbook tested and reproducible in staging.

## 7. Risks and Mitigations

- Risk: policy complexity drift.
  - Mitigation: keep single source-of-truth catalog + CI route-mapping guard.
- Risk: stale authorization state with caching.
  - Mitigation: conservative TTL + invalidation on role/permission update.
- Risk: audit volume growth.
  - Mitigation: partitioning/retention strategy and aggregate query views.

## 8. Recommendation

Start Phase 3 with RBAC governance APIs and observability first, then hardening/performance, then data recovery automation. This sequencing gives highest operational value while preserving security controls established in v0.2.
