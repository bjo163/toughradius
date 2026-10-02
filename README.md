# MWX-ISP

**ISP Management + RADIUS + Billing**

MWX-ISP is an operator-facing application for a single ISP installation. It combines customer and service management, RADIUS network access, and a practical subscription billing lifecycle in one modular application. Existing RADIUS users, profiles, NAS devices, accounting records, sessions, and Disconnect support remain part of the product.

The initial business flow is:

```text
Customer → Internet Package → Subscription → RADIUS access
         → Monthly invoice → Manual payment → Suspend/reactivate
```

## Core modules

- **ISP Management:** customers, commercial internet packages, and subscriptions linked to RADIUS users and profiles.
- **RADIUS:** authentication, profiles, accounting, online sessions, NAS management, and Disconnect/CoA.
- **Billing:** monthly invoices, due dates, grace periods, overdue handling, manual and partial payments, automatic suspension, and payment-based reactivation.
- **Operations:** dashboard, operators, and system settings.

Payment gateways, customer portal, WhatsApp, ticketing, fiber inventory, multi-tenancy, and accounting ERP are outside the initial release.

## Requirements

- Go version specified in `go.mod`
- Node.js 18 or newer for frontend development
- PostgreSQL for production, or SQLite for local development

## Build from this checkout

```bash
cd web
npm ci
npm run build
cd ..
go build -o mwx-isp .
```

The frontend build produces the embedded admin UI. For frontend development, run `npm run dev` from `web/`.

## Configuration

Create a local YAML configuration file, for example `mwx-isp.yml`:

```yaml
system:
  appid: MWX-ISP
  location: Asia/Jakarta
  workdir: ./rundata

database:
  type: sqlite
  name: mwx-isp.db

radiusd:
  enabled: true
  host: 0.0.0.0
  auth_port: 1812
  acct_port: 1813
```

PostgreSQL is preferred for production. Set a strong `web.secret` and database credentials before exposing the management API. Existing deployments can continue using the established `TOUGHRADIUS_*` environment variable names during this transition.

On first start, the application adds ISP tables through the existing additive AutoMigrate path. A fresh local database starts with `admin` / `admin`; an existing custom admin password is preserved across restart and upgrade. If a previous build generated an admin password, keep using that password or reset it with the password reset tool. Existing RADIUS tables and subscriber data are not dropped by startup migration. Change the default password before exposing the management UI to a network.

Customer IDs (`MWX-000001`) and package codes (`PKG-000001`) are generated automatically. Invoice and payment numbers use independent atomic monthly counters (`INV-YYYYMM-000001`, `PAY-YYYYMM-000001`); operators do not need to enter these numbers.

```bash
./mwx-isp -c mwx-isp.yml
```

## Billing defaults

The system settings include a default billing day (1–28), default due days, default grace days, automatic suspension, and automatic reactivation. Subscription billing days are restricted to 1–28. Amounts are integer IDR. Each manual payment is applied to one invoice; partial payments are supported.

An overdue subscription is suspended only after its invoice due date and grace period have both passed. The RADIUS account is disabled and active sessions are disconnected using the existing Dynamic Authorization support. A subscription suspended manually is not automatically reactivated by billing.

The UI defaults to English. Validate RADIUS authentication, accounting, CoA/Disconnect, and authentication after reactivation with your actual NAS before production; local tests do not establish vendor-specific NAS compatibility.

## Development references

- [MWX-ISP product blueprint](docs/MWX-ISP-blueprint.md)
- [MWX-ISP implementation checklist](docs/MWX-ISP-todo.md)
- [Feature scope checklist](docs/feature-checklist.md)
- [Agent development guide](AGENT.md)
