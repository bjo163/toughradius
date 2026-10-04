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

Untuk mengelola beberapa ISP atau RT/RW Net dalam satu instalasi, konfigurasi
operator platform opsional melalui `MWX_PLATFORM_ADMIN_USERNAME` dan
`MWX_PLATFORM_ADMIN_PASSWORD`. Dari menu **Platform → Organizations**, buat
organisasi dan administrator tenant pertamanya. Operator tenant masuk memakai
slug organisasi, username, dan password. Tenant ID dari request tidak memberi
akses. Data lama dimigrasikan ke organisasi `default` tanpa mengganti ID atau
kredensial pelanggan.
Pada baris organisasi yang sama, administrator platform dapat membuat akses
operator tenant dengan peran `admin` atau `operator`, lalu mencabutnya. Pencabutan
menonaktifkan membership dan token yang sudah terbit ditolak pada request
berikutnya. Kredensial operator tetap lokal per tenant; username dan password
yang sama di organisasi lain adalah akun terpisah yang harus dibuat secara sadar.

RADIUS menentukan tenant dari NAS yang terdaftar sebelum mencari pelanggan.
Pada listener bersama, alamat IP sumber setiap NAS harus unik di seluruh
instalasi; identitas NAS ambigu akan ditolak. Uji setiap tenant dengan NAS dan
kredensialnya sendiri sebelum onboarding pelanggan.

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

**System Config → Backup** hanya tersedia bagi administrator platform dan
mengunduh snapshot JSON installation-wide skema 9.2. Snapshot berisi semua
organisasi beserta metadata kepemilikan tenant tersembunyi, konfigurasi node
dan NAS, profil/pelanggan RADIUS, accounting dan audit operator, customer,
paket, subscription, invoice, pembayaran, sequence dokumen, target/sampel/
insiden monitoring, pengaturan dan outbox notifikasi, membership operator,
operator, sertifikat
beserta private key, serta kredensial SNMP terenkripsi. Sesi online sengaja
tidak disalin karena statusnya menjadi usang; NAS membangunnya kembali saat
tersambung.

Restore memulihkan data semua organisasi dalam satu transaksi. Hak administrator
platform yang sudah ada dipertahankan, dan file backup tidak dapat memberikan
hak tersebut. File snapshot tetap berisi password pelanggan, hash password
operator, private key sertifikat, dan rahasia produksi; lindungi seperti secret
produksi. Simpan salinan backup di luar server dan lakukan uji pemulihan berkala.
Untuk disaster recovery penuh, buat juga dump PostgreSQL terenkripsi:

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
