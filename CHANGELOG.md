# MWX-ISP Changelog

## v0.2.2 — 2026-10-04

Changes since v0.2.1:

### Fixes and Improvements

- allow safe backfill of unpublished tags

## v0.2.1 — 2026-10-04

Changes since v0.2.0:

### Fixes and Improvements

- set tag when publishing reusable release

## v0.2.0 — 2026-10-04

Changes since v0.1.0:

### Features

- manage revocable tenant operator memberships
- show active organization
- edit tenant billing identity
- add platform tenant console
- automate SemVer changelog and publishing
- scope admin ORM requests by tenant
- bind admin login to tenant
- add tenant catalog and legacy migration

### Fixes and Improvements

- classify commits with empty bodies
- pass publisher permissions and secrets
- grant reusable publisher issue access
- scope destructive API operations
- sync metadata onto advancing dev
- scope audit log retention per tenant
- scope retention across organizations
- round-trip tenant data in system backups
- scope shared operations controls
- preserve platform access on restore
- restrict global controls to platform admins
- scope CoA NAS resolution
- scope demo seed cleanup
- scope network monitoring and alerts
- scope billing scheduler per tenant
- isolate RADIUS authentication state
- preserve scoped upsert SQL on PostgreSQL
- satisfy tenant migration lint
- advance PostgreSQL tenant sequence
