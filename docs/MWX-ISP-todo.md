# MWX-ISP — Todo Checklist

Checklist ini diturunkan dari master prompt. Tandai setelah pekerjaan terkait benar-benar selesai.

## Tahap 0 — Kenali proyek dan persiapan

- [x] Tinjau struktur backend dan frontend lokal.
- [x] Tinjau model database dan mekanisme migrasi/AutoMigrate.
- [x] Tinjau implementasi RADIUS user/profile, autentikasi, accounting, sesi online, NAS, dan CoA/Disconnect.
- [x] Tinjau manajemen operator, API, React frontend, scheduler, settings, dan zona waktu.
- [x] Catat pola proyek yang akan dipakai; hindari laporan arsitektur panjang dan refactor besar.

## Tahap 1 — Branding dan ISP Management

- [x] Ganti branding yang terlihat menjadi MWX-ISP: login, judul browser, dashboard, sidebar, dan judul aplikasi.
- [x] Tambahkan model Customer dengan nomor unik `MWX-000001`, kontak, alamat, status, catatan, dan timestamp.
- [x] Tambahkan API Customer: list, create, edit, detail.
- [x] Tambahkan UI daftar, buat, edit, dan detail Customer.
- [x] Tampilkan nomor, nama, telepon, paket, username RADIUS, status, dan outstanding pada daftar Customer.
- [x] Tambahkan model Internet Package/BillingProduct sesuai pola proyek: kode, nama, harga integer IDR, RadiusProfile, deskripsi, siklus, status.
- [x] Tambahkan API dan UI CRUD paket.
- [x] Generate kode paket `PKG-000001` otomatis dari ID; operator tidak perlu mengisi kode dan kode tetap stabil ketika paket diedit.
- [x] Pastikan paket komersial terpisah dari RadiusProfile dan tertaut ke profil yang sesuai.
- [x] Tambahkan model Subscription dengan nomor unik, Customer, Package, RadiusUser, status, tanggal mulai, billing day 1–28, grace days, alasan suspend, dan timestamp.
- [x] Dukung lebih dari satu subscription per Customer.
- [x] Tambahkan API dan UI pembuatan serta pengelolaan subscription.

## Tahap 2 — Integrasi RADIUS

- [x] Gunakan implementasi RadiusUser yang sudah ada; jangan menulis ulang mesin RADIUS.
- [x] Pada pembuatan subscription, sediakan pilihan membuat RadiusUser atau menghubungkan user yang ada.
- [x] Untuk user baru, dukung username, password, profile default dari package, dan status.
- [x] Tautkan Subscription dengan RadiusUser.
- [x] Pastikan subscription aktif mengaktifkan RadiusUser.
- [x] Pastikan subscription suspended menonaktifkan RadiusUser.
- [x] Pastikan reactivation mengaktifkan RadiusUser.
- [x] Saat suspend, disconnect sesi aktif memakai CoA/Disconnect yang sudah ada bila tersedia.
- [x] Sediakan aksi Activate, Suspend, Reactivate, Disconnect, dan Terminate di UI.
- [x] Beri konfirmasi untuk aksi destruktif.
- [x] Pastikan RadiusUser lama tetap berfungsi dan dapat ditautkan.

## Tahap 3 — Billing dan invoice

- [x] Tambahkan model Invoice dengan nomor `INV-YYYYMM-000001`, relasi customer/subscription, periode/tanggal, nilai, paid amount, balance, status, catatan, dan timestamp.
- [x] Tambahkan model InvoiceItem dengan deskripsi, kuantitas, harga saat invoice dibuat, dan total.
- [x] Gunakan integer untuk seluruh nominal IDR.
- [x] Tambahkan generator nomor invoice yang aman dari duplikasi.
- [x] Gunakan counter atomik per bulan dan jenis dokumen agar nomor invoice/payment konsisten `...-000001` dan tidak bergantung pada ID global.
- [x] Tambahkan `DefaultDueDays` dan hitung due date dari invoice date.
- [x] Implementasikan `GenerateMonthlyInvoices` untuk subscription aktif yang sudah mencapai billing day.
- [x] Cegah invoice ganda untuk subscription dan periode yang sama dengan constraint database.
- [x] Batasi billing day pada 1–28 dan dokumentasikan batasan tersebut.
- [x] Implementasikan pemrosesan overdue bila tanggal kini melewati due date dan saldo masih ada.
- [x] Tambahkan BillingEvent untuk mencatat event lifecycle yang diperlukan.
- [x] Tambahkan UI daftar/detail invoice dengan filter customer, status, dan nomor.

## Tahap 4 — Payment

- [x] Tambahkan model Payment dengan nomor `PAY-YYYYMM-000001`, customer, satu invoice, nominal, metode, referensi, paid at, status, catatan, dan timestamp.
- [x] Dukung metode cash, bank_transfer, manual, dan other.
- [x] Tambahkan pencatatan pembayaran manual dari invoice.
- [x] Dukung pembayaran parsial dan pembayaran penuh.
- [x] Perbarui paid amount, balance, dan status invoice secara benar.
- [x] Tolak nominal pembayaran yang melebihi saldo tersisa.
- [x] Gunakan transaksi untuk menjaga konsistensi pencatatan payment dan invoice.
- [x] Tambahkan UI daftar dan detail/pencatatan payment.

## Tahap 5 — Auto suspend dan reactivate

- [x] Implementasikan `SuspendOverdueSubscriptions`.
- [x] Hanya suspend setelah invoice overdue dan grace period subscription habis.
- [x] Set status subscription dan alasan `billing_overdue`.
- [x] Nonaktifkan RadiusUser dan disconnect sesi aktif.
- [x] Catat event invoice overdue dan subscription suspended.
- [x] Setelah invoice lunas, reactivate hanya subscription yang suspended karena `billing_overdue`.
- [x] Jangan otomatis mengaktifkan kembali subscription yang disuspend manual.
- [x] Aktifkan kembali RadiusUser ketika subscription direactivate.
- [x] Catat event payment received dan subscription reactivated.

## Tahap 6 — Dashboard dan pengalaman operator

- [x] Tampilkan jumlah Customer.
- [x] Tampilkan subscription aktif dan suspended.
- [x] Tampilkan online users.
- [x] Tampilkan invoice dan payment bulan ini.
- [x] Tampilkan outstanding dan overdue.
- [x] Jadikan Customer Detail pusat informasi Customer, subscription, package, RADIUS, koneksi, invoice, payment, dan outstanding.
- [x] Tampilkan status online/offline, current IP bila tersedia, dan aksi operasional pada Subscription Detail.
- [x] Susun menu Dashboard, Customers, Services, Billing, RADIUS, Network, dan System.
- [x] Tambahkan settings perusahaan, mata uang, default billing/due/grace days, auto suspend, dan auto reactivate memakai sistem settings yang ada.

## Tahap 7 — Data, validasi, dan penyelesaian

- [x] Set default mata uang IDR dan zona waktu `Asia/Jakarta`.
- [x] Utamakan PostgreSQL produksi dan pertahankan dukungan SQLite yang sudah berfungsi.
- [x] Pastikan perubahan schema aditif serta tidak menghapus tabel/data RADIUS lama.
- [x] Tangani nomor customer duplikat, package/RadiusUser tidak valid, invoice duplikat, pembayaran berlebih, dan status subscription tidak valid.
- [x] Gunakan transaksi pada pembuatan invoice dan perubahan suspend/reactivate yang perlu konsisten.
- [x] Setelah alur inti bekerja, tambahkan tes billing, payment parsial/penuh, auto suspend/reactivate, grace period, invoice idempotency, dan state subscription.
- [x] Rapikan UI dan validasi penting setelah fungsionalitas inti selesai.
- [x] Perbarui README dengan branding, fitur, instalasi, PostgreSQL, konfigurasi RADIUS, customer, package, billing, suspend/reactivate, dan pengembangan.
- [x] Siapkan deployment Docker setelah core berfungsi; image multi-stage menetapkan `Asia/Jakarta` dan label MWX-ISP.

## Kriteria selesai milestone inti

- [x] Tersedia flow untuk menautkan RadiusProfile ke Internet Package.
- [x] Flow aplikasi untuk membuat Customer, Subscription, dan RadiusUser serta mengaktifkan layanan sudah tersedia.\r\n- [ ] Verifikasi autentikasi RADIUS end-to-end dengan NAS riil masih perlu dilakukan saat deployment.
- [x] Invoice dapat dibuat dan menampilkan total, tanggal jatuh tempo, serta saldo.
- [x] Overdue + grace habis men-suspend subscription dan menonaktifkan RadiusUser; scheduler mencoba disconnect sesi aktif dengan CoA.
- [x] Pembayaran penuh menandai invoice paid serta mengaktifkan kembali subscription dan RadiusUser bila setting auto-reactivate aktif.
- [ ] Uji autentikasi ulang pelanggan setelah reactivation dengan NAS riil masih perlu dilakukan saat deployment.

## Pemeriksaan pematangan lokal

- [x] Pertahankan password admin pada restart/upgrade; bootstrap instalasi baru tetap `admin/admin`, sementara password custom dan password bootstrap lama tidak dirotasi diam-diam.
- [x] Jadikan English satu-satunya locale yang dimuat aplikasi; perbaiki teks fallback UI yang tercampur bahasa.
- [x] Tambahkan regresi otomatis untuk nomor invoice/payment lintas periode dan kode package otomatis.
- [ ] Uji RADIUS auth, accounting, CoA/Disconnect, dan reactivation dengan NAS sebenarnya sebelum produksi.

Catatan: pengujian lokal mengonfirmasi layanan aplikasi, API, SQLite, dan counter billing. Uji NAS nyata memerlukan alamat/secret NAS dan pelanggan uji pada deployment; hasil lokal tidak mewakili interoperabilitas vendor NAS.
