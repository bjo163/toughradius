# Panduan Admin

> English version: [Admin UI Manual](../en/admin-manual.md)

## Alur onboarding

1. Login menggunakan akun admin yang dibuat saat instalasi, lalu ganti password.
2. Tinjau **Network & Alerts** dan daftarkan perangkat yang memang boleh dipantau.
3. Buat **RADIUS Profile** untuk atribut dan kecepatan akses.
4. Daftarkan **NAS** menggunakan alamat sumber dan shared secret yang sesuai.
5. Buat **Customer** dan **Package**, lalu hubungkan melalui **Subscription**.
6. Periksa invoice dan catat pembayaran melalui menu **Billing**.
7. Verifikasi autentikasi dan accounting dari NAS sebelum layanan pelanggan.

## Menu utama

| Menu | Kegunaan |
| --- | --- |
| Dashboard | Ringkasan pelanggan, sesi, layanan, dan billing |
| Customers | Profil, kontak, subscription, invoice, dan saldo pelanggan |
| Packages | Paket komersial dan relasinya dengan RADIUS Profile |
| Subscriptions | Aktivasi layanan pelanggan dan pengaturan siklus billing |
| Billing | Invoice, pembayaran manual, dan status jatuh tempo |
| Users / Profiles | Akun RADIUS dan kebijakan akses jaringan |
| Online Sessions / Accounting | Sesi aktif dan riwayat autentikasi / accounting |
| NAS / Network Nodes | Perangkat jaringan yang terdaftar |
| Network & Alerts | Status pemeriksaan jaringan dan notifikasi operator |
| Product Branding | Nama, logo, tagline, dan warna instalasi |
| System Configuration | Konfigurasi layanan dan operasional |

Nomor customer, subscription, invoice, dan payment dihasilkan oleh sistem.
Jangan membuat nomor secara manual atau memakai ulang sample user pada jaringan
produksi. Data contoh hanya dibuat saat database benar-benar kosong.

Untuk detail field, hak akses, dan tampilan setiap halaman, lihat
[manual lengkap berbahasa English](../en/admin-manual.md).
