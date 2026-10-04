# MWX-ISP Handbook / Buku Panduan MWX-ISP

![MWX-ISP — ISP management, billing, and RADIUS](./assets/mwx-isp-cover.svg)

MWX-ISP brings ISP operations, subscriber billing, RADIUS, and network
visibility together in one self-hosted platform. It supports ISP and RT/RW Net
workflows, with PostgreSQL as the production database.

MWX-ISP menyatukan operasional ISP, billing pelanggan, RADIUS, dan pemantauan
jaringan dalam satu platform yang dapat di-host sendiri. Platform mendukung
alur kerja ISP dan RT/RW Net, dengan PostgreSQL sebagai database produksi.

## Start here / Mulai dari sini

- **[Quick Start / Mulai Cepat](./en/quickstart.md)** — install on a VPS, sign
  in, explore sample data, and run an initial RADIUS check.
- **[Panduan Mulai Cepat Bahasa Indonesia](./id/quickstart.md)** — instalasi,
  login, data contoh, dan pemeriksaan awal RADIUS.
- **[English handbook](./en/overview.md)** — setup, administration, integration,
  and operations.
- **[Buku panduan Bahasa Indonesia](./id/overview.md)** — panduan instalasi,
  administrasi, integrasi, dan operasional.
- [Latest release](https://github.com/bjo163/mwx-isp/releases/latest) ·
  [Source code](https://github.com/bjo163/mwx-isp) ·
  [Report an issue](https://github.com/bjo163/mwx-isp/issues)

## What MWX-ISP covers / Cakupan MWX-ISP

| Area | Capabilities |
| --- | --- |
| Subscriber operations | Customers, packages, subscriptions, billing, payments, and automatic document numbering |
| Network access | RADIUS authentication and accounting, NAS management, RadSec, CoA, and Disconnect |
| Organization | Tenant-aware ISP and RT/RW Net operations and administration |
| Visibility | Dashboards, network monitoring, alerts, and WhatsApp integration |

## Install on Ubuntu or Debian VPS

The installer configures Docker when needed, generates deployment credentials,
and starts MWX-ISP with PostgreSQL. A public domain is optional; without one,
admin access remains private and the installer prints an SSH-tunnel command.

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash'
```

See the [full Quick Start](./en/quickstart.md) before exposing RADIUS to a live
network. Public HTTPS requires DNS and inbound TCP ports 80 and 443 to reach the
server. The installer does not change firewall rules.

## Build the handbook

```bash
cargo install mdbook
mdbook serve docs-site
```
