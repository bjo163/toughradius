# Operations Guide

> Bahasa Indonesia: [Versi Indonesia](../id/ops-guide.md)

Everything you need to run MWX-ISP in production: configuration reference,
environment variables, TLS/EAP certificates, storage, monitoring, backup, and
the bundled command-line tools.

## Process model

One static binary runs several services concurrently (web/admin API, RADIUS
auth, RADIUS accounting, RadSec). **If any service fails, the whole process
exits** so a supervisor can restart it — run it under systemd, Docker, or an
equivalent.

```ini
# /etc/systemd/system/mwx-isp.service (reference)
[Unit]
Description=MWX-ISP server
After=network-online.target

[Service]
ExecStart=/usr/local/bin/mwx-isp -c /etc/mwx-isp.yml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## Ports

| Port | Protocol | Service | Config key |
| ---- | -------- | ------- | ---------- |
| 1816 | TCP HTTP | Admin UI + REST API | `web.port` |
| 1817 | TCP HTTPS | Admin UI over TLS (optional; start failure is non-fatal) | `web.tls_enabled` / `web.tls_port` |
| 1812 | UDP | RADIUS authentication | `radiusd.auth_port` |
| 1813 | UDP | RADIUS accounting | `radiusd.acct_port` |
| 2083 | TCP TLS | RadSec (RFC 6614) | `radiusd.radsec_port` |
| 3799 | UDP (outbound) | CoA/Disconnect **to** the NAS | per-NAS *CoA port* field |

## Configuration

For a new manual install, pass an explicit MWX-ISP config path, such as `-c /etc/mwx-isp.yml`. Existing fallback config names remain available to support upgrades. Inspect the merged result with `mwx-isp -printcfg -c /etc/mwx-isp.yml`.

> **Upgrade compatibility:** `TOUGHRADIUS_*`, `/var/toughradius`, and several file names remain stable so existing installs keep reading their configuration, database, certificates, and logs. The Docker VPS installer explicitly configures PostgreSQL.

```yaml
system:
  appid: MWX-ISP
  location: Asia/Jakarta         # cron/timestamp timezone
  workdir: /var/toughradius      # default in production builds
  debug: false
web:
  host: 0.0.0.0
  port: 1816
  tls_enabled: true              # Enabled by default for compatibility; set false to disable the built-in HTTPS listener
  tls_port: 1817
  secret: <random-string>        # JWT signing secret — change it
database:
  type: postgres                # postgres | sqlite (local or legacy deployments)
  host: 127.0.0.1                # postgres only
  port: 5432
  name: mwxisp                   # PostgreSQL database name
  user: postgres
  passwd: <password>
  max_conn: 100
  idle_conn: 10
  debug: false
radiusd:
  enabled: true
  host: 0.0.0.0
  auth_port: 1812
  acct_port: 1813
  radsec_port: 2083
  radsec_worker: 100
  radsec_ca_cert: private/ca.crt        # relative paths resolve against workdir
  radsec_cert: private/radsec.tls.crt
  radsec_key: private/radsec.tls.key
  debug: false                   # true = full packet dumps
logger:
  mode: production               # development | production
  file_enable: true
  filename: /var/toughradius/toughradius.log
```

### Working directory layout

On startup MWX-ISP creates under `system.workdir`:

```text
/var/toughradius/
├── data/        # local SQLite data (when selected) and metrics data
├── logs/
├── private/     # TLS material (mode 0700)
├── public/
└── backup/      # server-side copies of configuration backups
```

### Environment variables

Environment variables override the YAML file:

| Variable | Overrides |
| -------- | --------- |
| `TOUGHRADIUS_SYSTEM_WORKER_DIR` | `system.workdir` |
| `TOUGHRADIUS_SYSTEM_DEBUG` | `system.debug` |
| `TOUGHRADIUS_WEB_HOST` / `_WEB_PORT` / `_WEB_TLS_ENABLED` / `_WEB_TLS_PORT` / `_WEB_SECRET` | `web.*` |
| `TOUGHRADIUS_DB_TYPE` / `_DB_HOST` / `_DB_PORT` / `_DB_NAME` / `_DB_USER` / `_DB_PWD` / `_DB_DEBUG` | `database.*` |
| `TOUGHRADIUS_RADIUS_ENABLED` / `_RADIUS_HOST` / `_RADIUS_AUTHPORT` / `_RADIUS_ACCTPORT` / `_RADIUS_DEBUG` | `radiusd.*` |
| `TOUGHRADIUS_RADIUS_RADSEC_PORT` / `_RADIUS_RADSEC_WORKER` / `_RADIUS_RADSEC_CA_CERT` / `_RADIUS_RADSEC_CERT` / `_RADIUS_RADSEC_KEY` | RadSec settings |
| `TOUGHRADIUS_LOGGER_MODE` / `_LOGGER_FILE_ENABLE` | `logger.*` |
| `TOUGHRADIUS_RADIUS_POOL` | RADIUS worker pool size (default 1024) |
| `TOUGHRADIUS_ADMIN_PASSWORD` | Optional first-start / rotation password for the bootstrap `admin` account. Ignored if it matches the historical default. |

### CLI flags

| Flag | Effect |
| ---- | ------ |
| `-c <file>` | Configuration file path |
| `-initdb` | **Drop and recreate all tables**, then exit |
| `-printcfg` | Print merged configuration as JSON, exit |
| `-v` | Print version / build time / commit, exit |
| `-h` | Usage |

Runtime RADIUS settings (EAP method, certificates, intervals, reject-delay…)
live in the database and are edited in **System Config** — no restart needed.
See the [Admin UI Manual](./admin-manual.md#system-config).

## Database

- **PostgreSQL** is the default and recommended database for production. Keep
  its data in a persistent volume and use the backup/restore procedures below.
- **SQLite** is available when explicitly selected for local development or
  supported legacy deployments. Its database file is stored under
  `{workdir}/data/`; do not assume this file contains production data when the
  installation uses PostgreSQL.

Schema migration (GORM `AutoMigrate`) runs automatically at every startup, so
upgrades are: stop, replace the binary, start. `-initdb` is for first
installation only — it **destroys all data**.

> **Upgrade note — EAP certificate file paths removed.** The legacy file-path
> settings `EapTlsCertFile` / `EapTlsKeyFile` / `EapTlsCaFile` have been
> **removed**: the managed certificate store (`sys_cert`) is now the only
> source of EAP-TLS/PEAP/TTLS certificate material. If your deployment
> configured certificate-based EAP via disk file paths, after upgrading you
> must import the PEM files on the **Certificates** page (the server
> certificate must include its private key) and select them by name in
> **System Config → `EapTlsServerCert` / `EapTlsClientCa`**. Until a managed
> server certificate is selected, certificate-based EAP methods safely reject
> all requests (`ErrTLSNotConfigured`) — plan the re-import before upgrading
> to avoid an EAP outage. PAP/CHAP/MSCHAPv2 (non-EAP) deployments are
> unaffected.

Large tables to watch: `radius_accounting` (grows with every session) and
`radius_online`. The `radius.AccountingHistoryDays` setting (default 90, set to
`0` to disable) defines the accounting retention window: a `@daily` job deletes
**terminated** `radius_accounting` rows older than that many days (active
sessions are untouched) and clears dangling `radius_online` rows that have
missed several interim updates. The operator action log (`sys_opr_log`) is
purged automatically after one year. For very high volumes, still consider
database-level archiving as part of your own ops.

## TLS and certificates

Three independent certificate consumers:

| Consumer | Files | Notes |
| -------- | ----- | ----- |
| **RadSec** | `radiusd.radsec_ca_cert` / `radsec_cert` / `radsec_key` | TLS 1.2+; client certificates are verified **if presented** (`VerifyClientCertIfGiven`) |
| **Web HTTPS** | `{workdir}/private/toughradius.tls.crt` + `.key` (fixed paths) | Listens on `web.tls_port` when `web.tls_enabled` is true; failure to load is logged, HTTP keeps running |
| **EAP (TLS/PEAP/TTLS)** | System Config → `EapTlsServerCert`, `EapTlsClientCa`, `EapTlsMinVersion`, `EapTlsCipherProfile` (import certificates on the Certificates page and select them by name) | No server certificate selected disables certificate-based EAP methods; default cipher profile is `modern`; CBC-only clients need opt-in `legacy-rsa-cbc` plus an RSA certificate |

Generate a complete CA/server/client set with the bundled tool:

```bash
go run ./cmd/certgen -type all -output /var/toughradius/private \
  -server-cn radius.example.com -server-dns radius.example.com \
  -days 3650
# then point radsec_cert/radsec_key (or the EAP settings) at the files
```

## Logging

zap structured logging. `logger.mode: development` = human-readable console;
`production` = JSON. File output controlled by `logger.file_enable` +
`logger.filename`. RADIUS verbosity is additionally tunable at runtime via
**System Config → LogLevel**; `radiusd.debug: true` dumps full packets (keep
off in production).

## Metrics

Counters are kept in memory and surfaced through the admin dashboard (there is
no Prometheus `/metrics` HTTP endpoint). RADIUS counters include: `radus_accept`,
`radus_online`/`radus_offline`, `radus_accounting`, `radus_auth_drop` /
`radus_acct_drop`, `radus_radsec_saturated`, and per-cause reject counters —
`radus_reject_passwd_error`, `radus_reject_not_exists`, `radus_reject_expire`,
`radus_reject_disabled`, `radus_reject_limit`, `radus_reject_bind_error`,
`radus_reject_ldap_error`, `radus_reject_unauthorized`, `radus_reject_other`.
`radus_reject_ldap_error` means the LDAP/AD backend could not give an
authentication answer — for example the directory is unreachable, TLS/StartTLS
failed, the service account bind failed, or the LDAP configuration is wrong;
wrong passwords are still counted under `radus_reject_passwd_error`.
Accounting-Requests dropped
at ingress are classified by reason — `radus_acct_drop_nas` (unknown or
unauthorized NAS), `radus_acct_drop_username` (missing username), and
`radus_acct_drop_secret` (bad Request Authenticator) — while `radus_acct_drop`
remains the catch-all for back-pressure and response-write drops. System gauges
(CPU/memory, process CPU/memory) are sampled every 30 s.

For external monitoring, probe the service ports and watch the log file; treat
process exit as the failure signal (the process model is fail-fast).

## Repair and uninstall a VPS deployment

The online repair command downloads the current official installer from the
`main` branch and runs its safe upgrade path. It checks the host, validates the
Compose configuration, backs up a running existing installation, and restores
the published services while keeping `.env` and persistent data:

```bash
curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-repair.sh | sudo bash
```

If an older uninstall removed the directory your SSH session was using, first
run `cd /opt` in that session, then rerun the installer. The current installer
recovers automatically from a stale working directory. Future uninstalls keep
the empty install directory so an active shell remains usable and reinstall can
clone into it.

Pass `--check` to run the installer's non-mutating preflight. Repair requires
the existing install directory and the matching `.env` when data volumes exist.
If PostgreSQL and the app are stopped, start them and create a backup before
repair so the installer can verify and protect the data.

Uninstall the services and checkout while preserving PostgreSQL/app data:

```bash
curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-uninstall.sh | sudo bash
```

The script also disables the MWX-ISP update and backup timers. It saves the
matching `.env` as `/opt/mwx-isp.env.uninstalled` for a future restore; keep that
file private because it contains database credentials. Backups under
`/var/backups/mwx-isp` are preserved. To permanently remove the database and app
data volumes, add `-s -- --purge` to the remote command. To delete local backups
as well, pass both `--purge` and `--remove-backups`. Both modes ask for the
literal confirmation `uninstall`; add `--yes` only for automation.

After a data-preserving uninstall, restore the saved configuration before
reinstalling so Compose reconnects to the existing database:

```bash
sudo git clone --depth 1 --single-branch --branch main https://github.com/bjo163/mwx-isp.git /opt/mwx-isp
sudo install -m 0600 -o root -g root /opt/mwx-isp.env.uninstalled /opt/mwx-isp/.env
curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash
```

## Backup and restore

**System Config → Backup** is restricted to a platform administrator and
downloads an installation-wide JSON snapshot (schema version 9.2). It includes
all organizations and hidden tenant-ownership metadata, plus nodes, NAS,
profiles, subscribers, accounting history, operator audit logs, ISP customers,
packages, subscriptions, invoices, payments, document sequences, monitor
targets/history, notification settings/outbox, tenant operator memberships,
system settings, operators, and
managed certificates. Certificate private keys and encrypted SNMP credentials
are preserved so EAP and monitoring continue after recovery. Online sessions
are intentionally omitted because restored session state would be stale; NAS
devices rebuild it as they reconnect. A copy is also written to
`{workdir}/backup/`. **Restore** imports the snapshot for every organization in
one database transaction and preserves the existing platform-administrator
grant; it never grants platform access from an uploaded file.

> For a full disaster-recovery story, also schedule encrypted database backups
> (`pg_dump` for PostgreSQL). Store database dumps and JSON snapshots off-site,
> and test recovery on a separate instance before relying on them.

> **Security**: snapshots contain subscriber passwords, operator password
> hashes, certificate private keys, and encrypted network credentials. Protect
> them as production secrets and restrict access to platform administrators.

## Multiple ISP and RT/RW Net organizations

MWX-ISP uses PostgreSQL shared-schema tenancy. Existing single-organization
records are assigned to the `default` organization by the migration without
changing subscriber IDs or credentials. Configure the optional
`MWX_PLATFORM_ADMIN_USERNAME` and `MWX_PLATFORM_ADMIN_PASSWORD` bootstrap only
for the operator authorized to administer the installation. From
**Platform → Organizations**, create an ISP or RT/RW Net organization and its
first tenant administrator. Tenant operators sign in with the organization
slug, username, and password; tenant IDs sent by a client do not grant access.
From the same organization row, platform administrators can provision
tenant-local operator memberships with an `admin` or `operator` role and revoke
them. Revocation disables the membership and rejects existing tokens on their
next request. Operator credentials remain tenant-local; use the same username
and password in another organization only when you intentionally provision a
separate account there.

RADIUS resolves the organization from the registered NAS before looking up a
subscriber. A shared listener requires each NAS source IP to be unique across
the installation; ambiguous registrations are rejected. Test each tenant with
its own NAS and credentials before onboarding subscribers. Tenant data, billing
sequences, monitoring, notifications, and operator access stay isolated while
product branding and system configuration remain installation-wide.

## Command-line tools

All live under `cmd/` and run with `go run ./cmd/<tool>`:

| Tool | Purpose |
| ---- | ------- |
| `radtest` | Mini RADIUS client: `auth`, `acct`, `flow` (auth + start + stop). Flags: `-server`, `-secret`, `-username`, `-password`, `-calling-station`, `-framed-ip`, `-session-id` |
| `certgen` | Generate CA / server / client certificates (see above) |
| `benchmark` | Load tester: total requests `-n`, concurrency `-c`, auth/acct modes, CSV stats output |
| `reset-password` | Reset a console operator password: `go run ./cmd/reset-password -c <cfg> -u admin -p <new>` |
| `demo-seed` | Populate demo nodes/NAS/profiles/users/sessions for evaluation |
| `config-tool` | Validate / summarize the settings schema JSON |

## Production hardening checklist

- [ ] Change `web.secret`. Configure and verify the deployment bootstrap administrator; never reuse a historical default.
- [ ] `radiusd.debug: false`, `logger.mode: production`.
- [ ] Restrict UDP 1812/1813 and TCP 1816 to trusted networks (firewall).
- [ ] Use RadSec (2083) or a trusted L2/VPN path for RADIUS across untrusted networks.
- [ ] Unique, strong shared secret per NAS.
- [ ] EAP: prefer `eap-tls`/`eap-peap`/`eap-ttls` with real certificates; mind
      the MS-CHAPv2 caveats in the [Security Policy](./security-policy.md).
- [ ] Database backups scheduled (config snapshot + DB dump).
- [ ] Supervisor with restart policy; alert on process exit.
