# MWX-ISP

**ISP Management + RADIUS + Billing**

[User Guide / GitHub Pages](https://bjo163.github.io/mwx-isp/) · [Repository documentation](docs/)

MWX-ISP is an operator-facing ISP management and RADIUS platform. The multi-tenant foundation supports independent ISP and RT/RW Net organizations in one deployment; tenant administration and end-to-end isolation are being completed under `TR-F033` before this capability is considered production-ready. Existing RADIUS users, profiles, NAS devices, accounting records, sessions, and Disconnect support remain part of the product.

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

Payment gateways, customer portal, ticketing, fiber inventory, reseller marketplace, and accounting ERP are outside the current scope. Multi-tenant operation is limited to the isolation, administration, and migration boundaries in `TR-F033`.

> **Release target:** v0.1.0 is the first MWX-ISP MVP release. The repository is code-ready for an initial release, but production cutover still requires the real-NAS authentication/accounting/reactivation pilot listed in `docs/MWX-ISP-todo.md`.

## Requirements

- Go version specified in `go.mod`
- Node.js 18 or newer for frontend development
- PostgreSQL for production, or SQLite for local development

## VPS deployment with Docker Compose

The repository root includes a production Compose stack with PostgreSQL, persistent database/application volumes, required secrets, health checks, and RADIUS ports. The VPS installer pulls the published multi-architecture image from GHCR; the package must remain public for passwordless installs. The admin UI is bound to `127.0.0.1:1816` by default so it is not exposed directly to the public internet; put it behind a TLS reverse proxy such as Caddy or Nginx.

On an Ubuntu/Debian VPS, the installer installs Docker Engine and the Docker Compose plugin when either is missing, then prepares and starts MWX-ISP:

```bash
git clone https://github.com/bjo163/mwx-isp.git
cd mwx-isp
sudo bash scripts/vps-install.sh
```

The installer clones the `main` deployment scripts, creates `/opt/mwx-isp/.env` with unique database, JWT, and admin credentials, then pulls the PostgreSQL and MWX-ISP release images. **Save the generated admin password printed by the installer.** Keep `/opt/mwx-isp/.env` private; it contains secrets. For a custom install directory, run for example `sudo env MWX_ISP_DIR=/srv/mwx-isp bash scripts/vps-install.sh` (absolute path, no spaces). Automatic Docker setup currently supports Ubuntu and Debian; other distributions should install Docker Engine and the Compose plugin using the [official guide](https://docs.docker.com/engine/install/) before running the installer. On systemd hosts it enables daily image-update and backup timers. Updates create a complete PostgreSQL + application-volume backup before replacing images, then wait up to two minutes for the PostgreSQL and app health checks. PostgreSQL stays on major version 16 while receiving minor image updates. Source and images are rolled back on failure; database schema changes are not automatically reversed, and the updater prints the explicit restore command when needed.

For a read-only host check, run `sudo bash scripts/vps-install.sh --check`. A new interactive install asks for the public domain and timezone; automation can use `--yes`, optionally setting `MWX_ISP_DOMAIN` and `MWX_ISP_TIMEZONE` via `sudo env`. The installer waits for PostgreSQL and app health and checks the local Caddy route before reporting success. Public HTTPS certificates still depend on DNS pointing to the VPS and inbound TCP 80/443 being reachable. If a new install is interrupted, rerun the installer to resume it; if services/data already exist, it creates a safety backup before continuing. It does not change host firewall rules; allow TCP 80/443 for Caddy and only the NAS RADIUS ports you use. Existing `.env` and data volumes are preserved.

For an existing install created by the older source-build installer, run the current installer once from a fresh `main` checkout; it snapshots a running app/database before advancing the deployment checkout and then migrates it to the release-image flow. If the old app or database is stopped, start both before migration so the installer can verify a complete backup.

Daily backups are stored under `/var/backups/mwx-isp` with restrictive permissions and 30-day local retention. They include a PostgreSQL custom-format dump, the application data volume (including certificates and uploaded branding), SHA-256 checksums, and the matching application image ID/release tag. List them with `sudo ls -lah /var/backups/mwx-isp`. Restore a set with `sudo bash /opt/mwx-isp/scripts/restore-db.sh /var/backups/mwx-isp/<timestamp>` and type `RESTORE` when prompted. Restore first creates a safety backup and refuses to proceed if it cannot retrieve the matching app image. Copy backups off the VPS regularly; same-host backups do not protect against VPS or disk loss. Review `docker compose ps`, `docker compose logs app`, and `systemctl list-timers 'mwx-isp-*'` after installation. To update manually, run `sudo bash /opt/mwx-isp/scripts/vps-update.sh`.

For the platform tenant console, set `MWX_PLATFORM_ADMIN_USERNAME` and `MWX_PLATFORM_ADMIN_PASSWORD` in `/opt/mwx-isp/.env` (password at least 12 characters), then run `sudo docker compose -f /opt/mwx-isp/docker-compose.yml up -d`. The configured account must match an existing default-tenant operator password or a platform administrator is created; credentials are never silently reset. Leave both values empty to disable platform tenant administration.

For a source checkout, copy `.env.vps.example` to `.env`, replace the `CHANGE_ME` values, and run `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`. This override builds the current source as `mwx-isp:local`; production installs use the published release image and should use the normal `docker compose up -d` flow.

Allow only the required NAS traffic in the VPS firewall: UDP 1812 (RADIUS auth), UDP 1813 (accounting), and TCP 2083 only when using RadSec. Do not expose PostgreSQL. For remote admin access, forward the local web port through a TLS reverse proxy. The app process runs as UID 10001; the updater migrates ownership of an older root-owned data volume before starting the upgraded app. Check service state/logs with `cd /opt/mwx-isp && docker compose ps` and `docker compose logs -f app`.

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
  type: postgres
  host: 127.0.0.1
  port: 5432
  name: mwxisp
  user: mwxisp
  passwd: change-this-password

radiusd:
  enabled: true
  host: 0.0.0.0
  auth_port: 1812
  acct_port: 1813
```

PostgreSQL is the default database. Configure its credentials and set a strong `web.secret` before starting the application. SQLite remains available only when explicitly selected for local development. Existing deployments can continue using the established `TOUGHRADIUS_*` environment variable names during this transition.

On first start, the application adds ISP tables through the existing additive AutoMigrate path. A fresh local database starts with `admin` / `admin`; an existing custom admin password is preserved across restart and upgrade. If a previous build generated an admin password, keep using that password or reset it with the password reset tool. Existing RADIUS tables and subscriber data are not dropped by startup migration. Change the default password before exposing the management UI to a network.

Customer IDs (`MWX-000001`) and package codes (`PKG-000001`) are generated automatically. Invoice and payment numbers use independent atomic monthly counters (`INV-YYYYMM-000001`, `PAY-YYYYMM-000001`); operators do not need to enter these numbers.

```bash
./mwx-isp -c mwx-isp.yml
```

## GitHub development and downloads

- `main` is the stable line and `dev` is the integration line. Repository rules reject creation, updates, or deletion of any other branch; no other branches are permitted.
- Every push to `main` or `dev` runs CI. A push to `dev` opens or updates one promotion pull request to `main` when there are changes to review.
- Pushes and pull requests targeting either branch produce a Windows AMD64 preview artifact with SHA-256 checksums. Download it from the run’s **Artifacts** section; it expires after 14 days.
- Version tags (`v*`) publish MWX-ISP release binaries and a multi-architecture container at `ghcr.io/bjo163/mwx-isp`.

The source module and product-facing release assets use MWX-ISP. Existing `TOUGHRADIUS_*` environment variables and configured data paths remain accepted for upgrade compatibility.

### Sample data on first install

A completely empty installation automatically receives clearly marked sample records for the main lists during its first startup. No separate seed executable is needed. Existing installations with an operator or any operational/business records are left unchanged; startup never refreshes or overwrites samples.

It creates 3 Nodes, 3 disabled NAS devices, 3 RADIUS Profiles, 6 disabled RADIUS Users, 6 Customers, 3 Packages, 6 Subscriptions, 6 current-period Invoices, 3 Payments, and 3 disabled Network & Alerts targets. IDs and billing document numbers use the normal application generators. Marked synthetic accounting history is included for dashboard charts, but no online sessions or probe results are faked. Sample RADIUS credentials use `123456` but the accounts start disabled; enable them only in an isolated test setup and never expose them to real customers.

The optional `cmd/demo-seed` utility remains available to explicitly refresh or clean marked examples in a test database. To remove only marked examples, run `demo-seed.exe -c mwx-isp.yml -clean` on Windows or `./demo-seed -c mwx-isp.yml -clean` on Linux/macOS. Cleanup preserves sequence counters and operator-created records/dependencies.
## Billing defaults

The system settings include a default billing day (1–28), default due days, default grace days, automatic suspension, and automatic reactivation. Subscription billing days are restricted to 1–28. Amounts are integer IDR. Each manual payment is applied to one invoice; partial payments are supported.

An overdue subscription is suspended only after its invoice due date and grace period have both passed. The RADIUS account is disabled and active sessions are disconnected using the existing Dynamic Authorization support. A subscription suspended manually is not automatically reactivated by billing.

The UI defaults to English. Validate RADIUS authentication, accounting, CoA/Disconnect, and authentication after reactivation with your actual NAS before production; local tests do not establish vendor-specific NAS compatibility.

## Development references

- [MWX-ISP product blueprint](docs/MWX-ISP-blueprint.md)
- [MWX-ISP implementation checklist](docs/MWX-ISP-todo.md)
- [Feature scope checklist](docs/feature-checklist.md)
- [Agent development guide](AGENT.md)
