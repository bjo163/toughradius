# MWX-ISP Changelog

## v0.7.0 — 2026-10-05

Changes since v0.6.0:

### Features

- add online VPS repair and uninstall

## v0.6.0 — 2026-10-05

Changes since v0.5.0:

### Features

- add SSH owner CLI for VPS operations

## v0.5.0 — 2026-10-05

Changes since v0.4.1:

### Features

- add private peer gossip service

## v0.4.1 — 2026-10-05

Changes since v0.4.0:

### Fixes and Improvements

- pull all service images before startup

## v0.4.0 — 2026-10-05

Changes since v0.3.2:

### Features

- simplify VPS installation to one command

## v0.3.2 — 2026-10-04

Changes since v0.3.1:

### Fixes and Improvements

- harden VPS installer and onboarding

## v0.3.1 — 2026-10-04

Changes since v0.3.0:

### Fixes and Improvements

- ignore placeholder comments in env checks

## v0.3.0 — 2026-10-04

Changes since v0.2.4:

### Features

- import local ISP enhancements

### Fixes and Improvements

- resolve CI findings in ISP integration
- install Docker prerequisites on VPS

## v0.2.4 — 2026-10-04

Changes since v0.2.3:

### Fixes and Improvements

- install Docker prerequisites on VPS (#17)

## v0.2.3 — 2026-10-04

Changes since v0.2.2:

### Fixes and Improvements

- harden VPS updates and recovery

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
