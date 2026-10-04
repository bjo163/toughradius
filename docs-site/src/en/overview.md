# Overview

> Bahasa Indonesia: [Versi Indonesia](../id/overview.md)

MWX-ISP is an open-source ISP operations platform written in Go. It combines
subscriber and billing workflows with RADIUS services, tenant-aware
administration, network monitoring, and a React management interface. PostgreSQL
is the default database for production; SQLite is available for local development.

## Core capabilities

- **RADIUS** — authentication, accounting, NAS management, online sessions,
  and audit history.
- **RadSec** — TLS-encrypted RADIUS over TCP (RFC 6614).
- **Dynamic authorization** — CoA and Disconnect messages (RFC 5176).
- **EAP / 802.1X** — EAP-MD5, EAP-MSCHAPv2, EAP-TLS, PEAPv0/EAP-MSCHAPv2, and
  EAP-TTLS. TLS 1.3 is supported for tunneled EAP. MS-CHAPv2-based methods are
  compatibility-oriented and carry an NTLMv1-like attack surface; prefer EAP-TLS
  where client certificates can be managed. TEAP and EAP-PWD remain roadmap items.
- **ISP operations and billing** — customers, packages, subscriptions, invoices,
  payments, automatic document numbering, and billing-based suspension/reactivation.
- **Tenant-aware administration** — organization management for independent ISP
  and RT/RW Net operations. See the [Operations Guide](./ops-guide.md).
- **Operations visibility** — dashboards, network monitoring, alerts, and
  optional WhatsApp integration.
- **Multi-vendor support** — Cisco, MikroTik, Huawei, and other devices through
  vendor-specific attributes (VSAs).
- **Database** — PostgreSQL by default for production; SQLite is available for
  local development and legacy deployments.

## Service ports

| Service | Protocol / port | Purpose |
| --- | --- | --- |
| Web / Admin API | HTTP, TCP `1816` | Management console and REST API |
| RADIUS Auth | UDP `1812` | Authentication |
| RADIUS Accounting | UDP `1813` | Session accounting |
| RadSec | TLS over TCP `2083` | Encrypted RADIUS transport |

## Where to go next

- [Quick Start](./quickstart.md) — install on a VPS, sign in, review sample
  records, and run an initial RADIUS check.
- [Concepts & Terminology](./concepts.md) — AAA vocabulary and product concepts.
- [Vendor Integration Guide](./vendor-guide.md) — MikroTik, Huawei, Cisco, and
  other NAS configuration.
- [Admin UI Manual](./admin-manual.md) — management console workflows.
- [Operations Guide](./ops-guide.md) — configuration, tenants, monitoring,
  backup, restore, and updates.
- [FAQ](./faq.md) — common installation and operations questions.
- [Documentation Map](./documentation-map.md) — roadmap, security policy,
  feature scope, and technical references.
