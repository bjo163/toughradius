# Mulai Cepat

> English version: [Quick Start](../en/quickstart.md)

Panduan ini memasang MWX-ISP di VPS Linux menggunakan Docker Compose dan
PostgreSQL, lalu memandu login awal dan uji koneksi RADIUS.

## 1. Instalasi VPS

Pasang Docker Engine dan plugin Docker Compose pada Ubuntu atau Debian. Arahkan
DNS domain ke server jika ingin Caddy mengurus sertifikat HTTPS otomatis, lalu:

```bash
git clone https://github.com/bjo163/mwx-isp.git
cd mwx-isp
sudo bash scripts/vps-install.sh
```

Jalankan pemeriksaan host tanpa perubahan:

```bash
sudo bash scripts/vps-install.sh --check
```

Pada instalasi baru interaktif, installer menanyakan domain publik dan zona
waktu. Untuk otomasi, tambahkan `--yes`;
default aman adalah `localhost` dan `Asia/Jakarta`. Contoh domain publik:

```bash
sudo env MWX_ISP_DOMAIN=isp.example.com MWX_ISP_TIMEZONE=Asia/Jakarta bash scripts/vps-install.sh --yes
```

Installer membuat kredensial privat, menarik image rilis PostgreSQL dan MWX-ISP,
lalu menjalankan PostgreSQL, MWX-ISP, dan Caddy. Simpan password admin satu-kali
yang dicetak installer. Installer menunggu health check PostgreSQL dan aplikasi
serta memeriksa rute Caddy lokal sebelum menyatakan selesai. Sertifikat HTTPS
publik bergantung pada DNS yang mengarah ke VPS dan akses masuk TCP 80/443. Jika
instalasi baru terputus, jalankan ulang installer; bila layanan atau data sudah
ada, installer membuat backup sebelum melanjutkan. Konfigurasi `.env` dan volume
data yang ada dipertahankan. Firewall host tidak diubah otomatis. Pada host
systemd, installer mengaktifkan update dan backup harian.

Atur `MWX_ISP_DOMAIN` dalam `/opt/mwx-isp/.env` ke domain publik untuk HTTPS.
`localhost` hanya untuk pemeriksaan lokal. Buka TCP 80/443 untuk Caddy dan hanya
port NAS yang dipakai: UDP 1812/1813 serta TCP 2083 jika memakai RadSec. Jangan
publikasikan port PostgreSQL. Tambahkan aturan firewall lewat pengelolaan VPS
atau firewall yang sudah digunakan, sambil menjaga akses SSH.

## 2. Login

Buka `https://<domain-anda>/admin/`, lalu masuk dengan username `admin` dan
password satu-kali dari installer. Segera ubah password setelah login. Saat
update, instalasi yang sudah ada tetap menggunakan password saat ini.

Untuk mulai mengoperasikan ISP: tinjau data contoh, atur branding dan identitas
tenant, daftarkan NAS beserta shared secret, tautkan profil RADIUS ke akun uji,
lalu validasi autentikasi dan accounting dari NAS tersebut. Biarkan NAS dan
akun RADIUS contoh tetap nonaktif sampai berada di jaringan uji terisolasi.
Tambahkan target monitoring dan alert WhatsApp opsional setelah alur RADIUS inti
berhasil.

## 3. Jelajahi data contoh

Database yang benar-benar kosong akan menerima data sintetis bertanda pada
startup pertama. Database lama tidak diubah. NAS dan akun RADIUS contoh dalam
keadaan nonaktif; aktifkan hanya dalam lingkungan pengujian terisolasi.

Jelajahi menu **Customers**, **Packages**, **Subscriptions**, **Billing**,
**Network & Alerts**, dan **RADIUS**. Nomor customer, paket, invoice, dan
pembayaran dibuat otomatis oleh aplikasi.

## 4. Uji RADIUS

Pada database pengembangan, daftarkan NAS `127.0.0.1` dengan shared secret
`testing123`, lalu buat akun uji yang aktif. Jalankan:

```bash
go run ./cmd/radtest auth \
  -server 127.0.0.1 -secret testing123 \
  -username test1 -password 111111
```

Untuk jaringan nyata, daftarkan alamat sumber NAS yang benar dan shared secret
yang kuat. Batasi firewall VPS ke trafik yang diperlukan. Uji autentikasi,
accounting, dan Disconnect dengan NAS yang akan digunakan sebelum melayani
pelanggan.

## 5. Backup dan update

```bash
cd /opt/mwx-isp
sudo scripts/backup-db.sh
sudo scripts/vps-update.sh
```

Salin backup ke penyimpanan aman di luar server. Updater membuat backup sebelum
update, memeriksa health aplikasi, dan mencoba rollback jika update gagal.

Lihat juga [Panduan Admin](./admin-manual.md),
[Panduan Operasional](./ops-guide.md), dan [FAQ](./faq.md).
