# MWX-ISP — Blueprint Produk

**Nama:** MWX-ISP
**Deskripsi:** ISP Management + RADIUS + Billing
**Target:** aplikasi mandiri untuk operasional satu ISP, dikelola operator/admin.

## 1. Tujuan dan alur utama

Bangun tiga modul inti: **ISP Management**, **RADIUS / Network Access**, dan **Billing**. Alur bisnis utama:

```text
Customer → Internet Package → Subscription → RADIUS Account → Internet Access
         → Invoice → Payment → Auto Suspend → Payment Received → Auto Reactivate
```

Produk fungsional lebih diutamakan daripada pemolesan atau pengujian ekstensif pada tahap awal. Gunakan modular monolith, pola proyek yang sudah ada, serta perubahan terkecil yang aman. Jangan menulis ulang mesin RADIUS atau merombak keseluruhan aplikasi.

## 2. Batas ruang lingkup

### Termasuk dalam rilis inti

- **ISP Management:** Customer, Internet Package, Subscription.
- **RADIUS:** Users, Profiles, Authentication, Accounting, Online Sessions, NAS, Disconnect/CoA bila tersedia.
- **Billing:** invoice bulanan, item invoice, jatuh tempo, grace period, overdue, pembayaran manual/parsial/penuh, suspend dan reactivate otomatis.
- **Operasional:** dashboard, operator, settings.

### Tidak termasuk sekarang

Payment gateway, WhatsApp, portal pelanggan, ticketing, CRM lanjutan, inventaris OLT/ODP/fiber, reseller, voucher/hotspot, laporan lanjutan, pajak/ERP akuntansi, aplikasi mobile, dan multi-tenant.

## 3. Model dan aturan bisnis

### Customer

Entitas pelanggan terpisah dari akun RADIUS. Data minimum: ID, nomor pelanggan (`MWX-000001`), nama, telepon, email, alamat/kota/provinsi, nomor identitas, status (`active`, `inactive`, `suspended`, `terminated`), catatan, waktu pembuatan/perubahan.

Halaman daftar menampilkan nomor, nama, telepon, paket, username RADIUS, status, dan saldo tertunggak. Detail pelanggan menjadi halaman operator utama untuk profil, subscription, invoice, payment, informasi serta status koneksi RADIUS.

### Internet Package dan RadiusProfile

Paket internet adalah produk komersial; `RadiusProfile` adalah kebijakan jaringan. Paket memuat kode, nama, harga integer IDR, relasi ke profil RADIUS, deskripsi, siklus tagihan, status, dan timestamp. Harga paket tidak menggantikan konfigurasi jaringan.

### Subscription dan RADIUS

Subscription menghubungkan Customer, Package, dan `RadiusUser`; satu customer boleh memiliki beberapa subscription. Data minimum: nomor (`SUB-000001`), tanggal mulai, billing day (1–28), grace days, status (`pending`, `active`, `suspended`, `terminated`), alasan suspend, timestamp.

Saat membuat subscription, operator dapat membuat akun RADIUS baru atau menghubungkan akun yang ada. Paket menentukan profil RADIUS default. Subscription aktif mengaktifkan user RADIUS; suspend menonaktifkan user dan memutus sesi aktif melalui fungsi yang sudah tersedia; reactivate mengaktifkan kembali user. Suspend manual tidak boleh otomatis dibatalkan oleh pembayaran. Sediakan aksi Activate, Suspend, Reactivate, Disconnect, dan Terminate, dengan konfirmasi untuk aksi destruktif.

### Invoice dan tagihan

Invoice menyimpan nomor (`INV-YYYYMM-000001`), customer, subscription, tanggal invoice/jatuh tempo, periode, subtotal/total, jumlah dibayar, saldo, status (`draft`, `issued`, `partial`, `paid`, `overdue`, `void`), catatan, dan timestamp. Item invoice menyimpan deskripsi, kuantitas, harga satuan aktual saat invoice dibuat, dan total. Uang menggunakan integer IDR, tidak memakai floating point.

Tagihan versi awal hanya bulanan. Scheduler `GenerateMonthlyInvoices` mencari subscription aktif yang tanggal tagihannya tercapai dan belum memiliki invoice periode tersebut. Cegah duplikasi dengan aturan unik database. Billing day dibatasi 1–28. `DefaultDueDays` menjadi default tanggal jatuh tempo. Overdue terjadi bila tanggal sekarang melewati due date dan saldo masih ada. Subscription memiliki `GraceDays`; suspend billing dilakukan setelah masa tenggang habis.

### Payment dan penegakan otomatis

Payment terhubung ke satu invoice untuk versi awal. Data minimum: nomor (`PAY-YYYYMM-000001`), customer, invoice, nominal integer, metode (`cash`, `bank_transfer`, `manual`, `other`), referensi, waktu bayar, status, catatan, timestamp. Dukung pembayaran parsial; saldo dan status invoice diperbarui. Tolak pembayaran yang melebihi saldo.

Sesudah invoice lunas, jika subscription berstatus suspended karena `billing_overdue`, aktifkan subscription dan user RADIUS kembali. Scheduler overdue menandai invoice, lalu setelah grace habis menangguhkan subscription, mengisi alasan `billing_overdue`, menonaktifkan user RADIUS, dan memutus sesi aktif.

Catat event ringan: `subscription_created`, `subscription_activated`, `invoice_generated`, `invoice_overdue`, `payment_received`, `subscription_suspended`, `subscription_reactivated`.

## 4. UI dan navigasi sasaran

```text
Dashboard
Customers
Services: Packages, Subscriptions
Billing: Invoices, Payments
RADIUS: Users, Online Sessions, Accounting, Profiles
Network: NAS, Nodes / POP
System: Operators, Settings
```

Dashboard menampilkan jumlah customer, subscription aktif/suspend, user online, invoice dan payment bulan ini, outstanding, serta overdue. Detail subscription menampilkan customer, paket/harga, username RADIUS, status/alasan suspend, billing day/grace days, status online/offline, dan aksi operasional. Daftar invoice menyediakan filter customer/status/nomor; daftar payment menampilkan nomor, customer, invoice, nominal, metode, dan tanggal.

## 5. Settings dan platform

Gunakan sistem settings yang ada bila tersedia. Setelan sasaran: nama/alamat/telepon/email perusahaan, mata uang IDR, billing day default, due days default, grace days default, auto suspend, dan auto reactivate. Default zona waktu `Asia/Jakarta`; jangan biarkan billing dipengaruhi zona waktu wilayah lain.

Utamakan PostgreSQL untuk produksi dan pertahankan SQLite yang sudah bekerja. Gunakan mekanisme migrasi/AutoMigrate proyek bila sesuai. Perubahan database harus aditif dan tidak boleh menghapus tabel atau data subscriber RADIUS lama. Akun RADIUS lama harus tetap dapat dipakai dan dihubungkan ke data Customer/Subscription baru.

## 6. Prinsip implementasi

- Ikuti pola backend, frontend, API, scheduler, autentikasi, settings, dan database yang telah ada.
- Simpan aturan bisnis penting di service: aktivasi/suspend/reactivate, pembuatan invoice, pembayaran, dan pemrosesan overdue.
- Gunakan transaksi pada pembayaran, suspend/reactivate, dan pembuatan invoice ketika perlu mencegah keadaan data yang tidak konsisten.
- Tangani duplikasi nomor, paket/user tidak valid, invoice duplikat, pembayaran berlebih, dan transisi status yang tidak valid.
- Branding yang terlihat menggunakan MWX-ISP; nama internal boleh tetap jika penggantian memperlambat pekerjaan.
- Implementasi dan alur inti didahulukan; pengujian penting, validasi tambahan, perapian UI, dokumentasi, dan Docker dilakukan setelah alur inti berjalan.
- Jangan clone repo, mengatur remote/push, mengejar kompatibilitas upstream, atau membangun microservice, ERP, event sourcing, dan infrastruktur yang tidak diperlukan.

## 7. Fase pengembangan

1. **Fondasi ISP:** branding MWX-ISP, Customer, Package, Subscription, model/API/UI.
2. **Integrasi RADIUS:** buat/tautkan user, Package → RadiusProfile, aktivasi, suspend, reactivate, disconnect.
3. **Billing inti:** invoice/item, penomoran, billing bulanan, due date, overdue, grace period.
4. **Pembayaran:** manual, parsial/penuh, saldo dan status invoice.
5. **Enforcement otomatis:** overdue → grace habis → suspend/disable/disconnect; pembayaran penuh → reactivate/enable.
6. **UI operasional:** dashboard serta detail Customer, Subscription, Invoice, dan halaman Payment.
7. **Penyelesaian:** validasi penting, tes penting, perapian, dokumentasi, dan persiapan Docker.

## 8. Kriteria milestone inti

1. Buat RadiusProfile, paket yang tertaut ke profile, customer, subscription, dan RadiusUser; aktifkan subscription dan pastikan autentikasi RADIUS berfungsi.
2. Buat invoice yang menampilkan total, due date, dan saldo.
3. Ketika invoice overdue dan grace habis, sistem suspend subscription, menonaktifkan RadiusUser, serta memutus sesi jika online; autentikasi tidak lagi berhasil.
4. Setelah admin mencatat pembayaran penuh, invoice menjadi paid, subscription dan RadiusUser aktif kembali, dan autentikasi dapat berhasil.

Rilis pertama berhasil ketika alur tersebut berfungsi dengan data RADIUS lama tetap aman.
