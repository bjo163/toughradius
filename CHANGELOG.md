# MWX-ISP Changelog

## v0.10.0 — 2026-10-05

Changes since v0.9.0:

### Features

- expose website & home editor in sidebar and public website shortcut in appbar (TR-F013) (#41)

## v0.9.0 — 2026-10-05

Changes since v0.8.4:

### Features

- ODP empty value clearing and full voucher batch printing (TR-F012, TR-F013) (#40)

## v0.8.4 — 2026-10-05

Changes since v0.8.3:

### Fixes and Improvements

- restore dashboard route at root and fix post-login redirect (TR-F013)

## v0.8.3 — 2026-10-05

Changes since v0.8.2:

### Fixes and Improvements

- enable interactive prompts by default during vps-repair (TR-F020)

## v0.8.2 — 2026-10-05

Changes since v0.8.1:

### Fixes and Improvements

- verify Caddy local HTTP proxy against /admin/ endpoint (TR-F020)

## v0.8.1 — 2026-10-05

Changes since v0.8.0:

### Fixes and Improvements

- pass stdin to backup-db invocation with bash -s (TR-F020)
- remove duplicate database backup in vps-update (TR-F020)

## v0.8.0 — 2026-10-05

Changes since v0.7.5:

### Features

- add interactive VPS TLS modes

### Fixes and Improvements

- preserve local checkout changes before updates
- make registration and ticket numbering atomic
- record creator and verify cached expiry

## v0.7.5 — 2026-10-05

Changes since v0.7.4:

### Fixes and Improvements

- make batch generation atomic and expire credentials
- resume clean install from empty orphaned volumes

## v0.7.4 — 2026-10-05

Changes since v0.7.3:

### Fixes and Improvements

- restart stopped services before install backup

## v0.7.3 — 2026-10-05

Changes since v0.7.2:

### Fixes and Improvements

- recover clean VPS installs without env
- close unverified public billing flows

## v0.7.2 — 2026-10-05

Changes since v0.7.1:

### Fixes and Improvements

- close unverified public billing flows (#31)

## v0.7.1 — 2026-10-05

Changes since v0.7.0:

### Fixes and Improvements

- recover after uninstall removes current directory

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
