# MWX-ISP backup and recovery

MWX-ISP has two different backup paths. The application JSON export is a
portable snapshot of selected application records. The VPS backup set captures
the PostgreSQL database, application data volume, checksums, and matching app
image metadata. Neither should be treated as an off-host copy until an operator
copies it to a separately protected system.

## Application JSON export

The platform-admin endpoint `GET /api/v1/system/backup` downloads the versioned
JSON snapshot. Schema `9.3` includes tenant and operator data, RADIUS profiles,
users and finalized accounting, ISP customers/packages/subscriptions/billing,
hotspot batches and vouchers, IPAM pools, trouble tickets/work orders, ODPs,
network-monitor configuration/history, notification settings/outbox, and
document sequences. Tenant ownership is stored in the backup's `tenant_ids`
map because the normal API intentionally hides `TenantID`.

Restore uses an upsert by record ID inside a database transaction. It restores
the captured rows and their tenant ownership, validates the references present
in the snapshot, and preserves records that exist only in the destination. It
does not delete destination-only rows, restore database schema, replace the
application data volume, or restore Docker/Caddy configuration. Older 9.x
payloads remain accepted; rows with hidden ownership metadata are assigned
according to their schema's compatibility rules.

Active RADIUS online-session rows and in-memory runtime/cache state are
intentionally not exported: they are transient and are rebuilt as devices
reconnect. Finalized accounting history is exported.

The JSON contains sensitive material, including RADIUS and voucher passwords,
operator password hashes, certificate private keys, and encrypted monitor
credentials. Treat the download and stored copy as secrets. The endpoint also
attempts to write a local copy under the configured backup directory; use the
VPS backup set for operational recovery and verify the resulting artifacts.

## VPS database and application-data backup

Run `scripts/backup-db.sh` as root on the installed VPS. By default, it writes
to `/var/backups/mwx-isp/<UTC timestamp>/`:

- `database.dump`: PostgreSQL custom-format dump.
- `application-data.tar.gz`: the app data volume.
- `metadata.txt`: source revision and matching application image identity.
- `SHA256SUMS`: checksums for the backup artifacts.

The script expects the app and database containers to be running, uses a lock
to avoid overlapping backup/update operations, and applies local retention.
Copy completed backup directories off-host using a protected channel and keep
the matching image available for the recovery window.

## Restore

`scripts/restore-db.sh <backup-directory>` validates checksums and matching app
image metadata, creates a safety backup of the current installation, then
replaces the live PostgreSQL database and app data volume. It requires an
explicit `RESTORE` confirmation unless `MWX_ISP_RESTORE_CONFIRM=RESTORE` is set.
Afterward, verify service health and application behavior before returning
traffic.

Restore scripts are destructive to the current database and app data after the
safety backup. Run them only with the exact backup directory selected and with
the VPS installation stopped from other update/restore work.

## Evidence and remaining recovery work

Unit coverage round-trips the operational ISP records and rejects a
cross-tenant relationship. PostgreSQL integration coverage exercises a real
multi-tenant JSON export, deletion of selected tenant rows, and restore through
the Admin API. CI also runs PostgreSQL/OpenLDAP integration tests.

These checks do not certify a full VPS disaster-recovery drill. The production
restore script, off-host copy, recovery time, and migration/rollback matrix
still need a scheduled isolated VPS drill before a recovery-time objective can
be claimed.
