# Mulai Cepat

> English version: [Quick Start](../en/quickstart.md)

Panduan ini memasang MWX-ISP di VPS Linux menggunakan Docker Compose dan
PostgreSQL, lalu memandu login awal dan uji koneksi RADIUS.

## 1. Instalasi VPS

Jalankan satu perintah ini pada VPS Ubuntu atau Debian. Installer memasang
Docker Engine dan Compose jika belum tersedia, membuat kredensial aman, lalu
menjalankan MWX-ISP tanpa pertanyaan setup:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash'
```

Installer memakai hostname server yang bisa di-resolve bila tersedia. Jika tidak,
halaman admin tetap privat di localhost dan installer mencetak perintah SSH
tunnel untuk akses jarak jauh yang aman. Untuk memakai domain dan zona waktu
sendiri, berikan nilainya langsung di perintah:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo env MWX_ISP_DOMAIN=isp.example.com MWX_ISP_TIMEZONE=Asia/Jakarta bash'
```

Untuk memilih konfigurasi web/TLS secara interaktif, jalankan:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash -s -- --interactive'
```

Pilih Let's Encrypt untuk domain publik yang mengarah ke VPS (TCP 80/443 harus
dapat diakses), HTTPS self-hosted untuk hostname privat (pasang root CA Caddy
pada setiap perangkat klien), atau HTTP localhost khusus akses SSH tunnel.
Prompt ini juga muncul saat `.env` lama dipulihkan. Pemeriksaan lokal opsional
`sudo bash scripts/vps-install.sh --check` tidak mengubah server.

Installer membuat kredensial privat, menarik image rilis PostgreSQL dan MWX-ISP,
lalu menjalankan PostgreSQL, MWX-ISP, dan Caddy. Simpan password admin satu-kali
yang dicetak installer. Installer menunggu health check PostgreSQL dan aplikasi
serta memeriksa rute Caddy lokal sebelum menyatakan selesai. Sertifikat HTTPS
publik bergantung pada DNS yang mengarah ke VPS dan akses masuk TCP 80/443. Jika
instalasi baru terputus, jalankan ulang installer; bila layanan atau data sudah
ada, installer membuat backup sebelum melanjutkan. Konfigurasi `.env` dan volume
data yang ada dipertahankan. Firewall host tidak diubah otomatis. Pada host
systemd, installer mengaktifkan update dan backup harian.

Untuk repair atau uninstall online yang aman, ikuti perintah dalam
[Panduan Operasional VPS](./ops-guide.md#perbaikan-dan-uninstall-deployment-vps).

Jangan publikasikan port PostgreSQL. Untuk Let's Encrypt, buka TCP 80/443 dan
hanya port NAS yang dipakai: UDP 1812/1813 serta TCP 2083 jika memakai RadSec.
Mode HTTP localhost hanya terikat ke loopback. Tambahkan aturan firewall lewat
pengelolaan VPS atau firewall yang sudah digunakan, sambil menjaga akses SSH.

## 2. Login

Jika domain publik telah disetel, buka `https://<domain-anda>/admin/`. Jika
installer memakai `localhost`, buat SSH tunnel dari komputer Anda:

```bash
ssh -L 1816:127.0.0.1:1816 <user>@<ip-server>
```

Lalu buka `http://localhost:1816/admin/`. Masuk dengan username `admin` dan
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
