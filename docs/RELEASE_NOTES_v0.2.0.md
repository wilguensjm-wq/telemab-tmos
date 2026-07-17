# TMOS Release Notes v0.2.0

Release Date: 2026-07-17
Tag: `v0.2.0`

## Summary

Version 0.2.0 finalizes backend RBAC implementation with centralized permission enforcement, deterministic route mapping, authorization auditing, and fail-closed behavior.

## Highlights

- Introduced canonical permission and role catalog.
- Added role-permission and user-role persistence model.
- Added centralized authorization middleware with permission checks.
- Enforced protected endpoint authorization across `/api/v1`.
- Logged all authorization decisions to audit trail (`authz.decision`).
- Implemented deny-by-default policy for unmapped protected routes.
- Added startup guard to fail when protected route mapping is incomplete.
- Added CI guard test to prevent unmapped protected routes.
- Completed live RBAC validation with 100% pass criteria.

## Validation Evidence

Final live run ID: `rbac-live4-1784301013570`

- Protected routes checked: 72
- Role-route checks: 216
- Status checks passed: 216/216
- Audit checks passed: 216/216
- Unauthorized checks returned 403: true
- Fail-closed unmapped route behavior: true
- Permission change effective at runtime: true

## Schema Changes

- Added migration `002_user_roles.sql`
  - `user_roles` table
  - `idx_user_roles_role_key` index

## Breaking/Behavioral Changes

- Protected route without explicit permission mapping is now denied (403).
- Startup fails if protected route mapping is incomplete.

## Non-Goals Confirmed

- No Reporter Control Room implementation.
- No UI role-management module.
- No additional provider integration in this release.

## Upgrade Notes

1. Apply migrations before starting backend.
2. Ensure `TMOS_DATABASE_URL` is configured.
3. Verify startup passes RBAC route mapping checks.

## Known Limitations

- Fine-grained resource-scoped policies are not yet implemented.
- UI-level role administration remains out of scope for v0.2.
