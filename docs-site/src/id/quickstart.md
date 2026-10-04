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

Installer menyiapkan kredensial privat, membangun image, lalu menjalankan
PostgreSQL, MWX-ISP, dan Caddy. Simpan password admin satu-kali yang dicetak
installer. Web admin hanya terikat ke localhost di belakang Caddy; port RADIUS
dibuka untuk koneksi NAS. Installer juga mengaktifkan update harian melalui
systemd jika tersedia.

Atur `MWX_ISP_DOMAIN` dalam `/opt/mwx-isp/.env` ke domain publik untuk HTTPS.
Jangan publikasikan port PostgreSQL ke internet.

## 2. Login

Buka `https://<domain-anda>/admin/`, lalu masuk dengan username `admin` dan
password satu-kali dari installer. Segera ubah password setelah login. Saat
update, instalasi yang sudah ada tetap menggunakan password saat ini.

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
