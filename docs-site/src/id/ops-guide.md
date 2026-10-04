# Panduan Operasional

> English version: [Operations Guide](../en/ops-guide.md)

## Deployment yang disarankan

Untuk VPS, gunakan Docker Compose dengan PostgreSQL dan reverse proxy HTTPS.
Instalasi otomatis tersedia melalui:

```bash
sudo bash scripts/vps-install.sh
```

Installer menghasilkan secret dan password unik, mengikat web admin ke
localhost, menyalakan PostgreSQL, serta memasang timer update harian jika
systemd tersedia. Tinjau `.env` dan simpan salinan kredensial di tempat aman.

## Port jaringan

| Port | Protokol | Akses |
| --- | --- | --- |
| `1816` | TCP | Web/Admin API; batasi di belakang HTTPS proxy |
| `1812` | UDP | RADIUS authentication dari NAS yang dikenal |
| `1813` | UDP | RADIUS accounting dari NAS yang dikenal |
| `2083` | TCP | RadSec bila dipakai |

Jangan membuka database PostgreSQL ke publik. Terapkan allowlist firewall untuk
NAS dan port yang benar-benar digunakan.

## Backup dan pemulihan

```bash
sudo /opt/mwx-isp/scripts/backup-db.sh
sudo /opt/mwx-isp/scripts/restore-db.sh /path/ke/backup.sql.gz
```

Backup lokal bukan salinan off-site. Salin backup terenkripsi ke lokasi terpisah
dan lakukan uji restore berkala. Sebelum update manual:

```bash
cd /opt/mwx-isp
sudo scripts/vps-update.sh
```

## Kompatibilitas upgrade

Nama variabel `TOUGHRADIUS_*`, direktori `/var/toughradius`, dan beberapa nama
file lama dipertahankan agar instalasi yang ada tetap dapat membaca konfigurasi,
database, log, serta sertifikatnya. Instalasi VPS baru menggunakan PostgreSQL.

Untuk daftar lengkap pengaturan, sertifikat, monitoring, log, dan prosedur
pemulihan, lihat [Operations Guide berbahasa English](../en/ops-guide.md).
