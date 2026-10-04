# MWX-ISP

![MWX-ISP — ISP operations, billing, and RADIUS](docs-site/src/assets/mwx-isp-cover.svg)

**ISP operations, subscriber billing, and RADIUS in one platform.**

[Documentation](https://bjo163.github.io/mwx-isp/) · [Quick start](https://bjo163.github.io/mwx-isp/en/quickstart.html) · [Latest release](https://github.com/bjo163/mwx-isp/releases/latest) · [Issues](https://github.com/bjo163/mwx-isp/issues)

MWX-ISP is a self-hosted ISP management platform for ISP and RT/RW Net
operations. It combines subscriber and billing workflows with RADIUS services,
tenant-aware administration, network monitoring, alerts, and a web console.

## What it includes

- **ISP operations and billing:** customers, packages, subscriptions, invoices,
  payments, automatic document numbering, and billing-based suspend/reactivate.
- **Network access:** RADIUS authentication and accounting, NAS management,
  online sessions, RadSec, CoA, and Disconnect.
- **Tenant-aware administration:** manage separate ISP and RT/RW Net
  organizations in one installation.
- **Operations visibility:** dashboards, network monitoring, alerts, and
  optional WhatsApp integration.
- **Production storage:** PostgreSQL by default. SQLite is available for local
  development and supported legacy deployments.

See the handbook for the complete [feature overview](https://bjo163.github.io/mwx-isp/en/overview.html),
[admin guide](https://bjo163.github.io/mwx-isp/en/admin-manual.html), and
[operations guide](https://bjo163.github.io/mwx-isp/en/ops-guide.html).

## Install on an Ubuntu or Debian VPS

One command installs Docker when required, prepares PostgreSQL, generates
deployment credentials, and starts MWX-ISP:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash'
```

Save the one-time admin password shown by the installer. A resolvable server
hostname enables Caddy HTTPS; without one, admin access stays private and the
installer prints an SSH-tunnel command. The installer does not change firewall
rules. Public HTTPS requires DNS to point to the VPS and inbound TCP `80`/`443`.

The first start of a completely empty database automatically adds marked sample
records so you can explore the interface. Existing data is not reseeded or
overwritten. Sample NAS and RADIUS users are disabled by default. Read the
[Quick Start](https://bjo163.github.io/mwx-isp/en/quickstart.html) and
[VPS operations guide](https://bjo163.github.io/mwx-isp/en/ops-guide.html)
before connecting production NAS devices.

To uninstall remotely while preserving the database and app data volumes:

```bash
curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-uninstall.sh | sudo bash
```

Add `-s -- --purge` to the command only when you intend to permanently delete
the database and app data. Add `--remove-backups` after `--purge` to also delete
`/var/backups/mwx-isp`. A repair command can refresh the checkout, validate the
Compose configuration, and restart the stack without deleting data:

```bash
curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-repair.sh | sudo bash
```

If a previous uninstall removed the directory your SSH shell was using, run
`cd /opt` once before rerunning the installer. The installer now recovers from
that stale shell directory automatically.

## Build from source

Requirements: the Go version specified in `go.mod` and Node.js 18 or newer.

```bash
cd web && npm ci && npm run build
cd ..
go build -o mwx-isp .
```

The frontend build embeds the admin UI in the Go binary. For frontend
development, run `npm run dev` from `web/`. For local configuration and manual
deployment, follow the [Operations Guide](https://bjo163.github.io/mwx-isp/en/ops-guide.html).

## Development and releases

- `main` is the stable line; `dev` is the integration line. The repository
  automation promotes changes from `dev` to `main` through a pull request.
- CI builds and verifies changes on both lines. Pushes and pull requests also
  produce a Windows AMD64 preview artifact with a SHA-256 checksum; preview
  artifacts expire after 14 days.
- Version tags (`v*`) publish release binaries and a multi-architecture image
  at `ghcr.io/bjo163/mwx-isp`.
- Product-facing names use MWX-ISP. Existing `TOUGHRADIUS_*` environment
  variables and data paths remain supported for upgrade compatibility.

## Project references

- [Product blueprint](docs/MWX-ISP-blueprint.md)
- [Feature scope checklist](docs/feature-checklist.md)
- [Development roadmap](docs/roadmap.md)
- [Agent development guide](AGENT.md)
- [Security policy](SECURITY.md)
