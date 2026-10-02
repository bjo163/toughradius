# MWX-ISP — Blueprint Produk

**Nama:** MWX-ISP
**Deskripsi:** ISP Management + RADIUS + Billing
**Target:** aplikasi mandiri untuk operasional satu ISP, dikelola operator/admin.

**Status saat ini (2026-10-02):** MVP manajemen ISP, RADIUS, dan billing telah diimplementasikan. Fake NAS berbasis UDP berhasil dipakai untuk memvalidasi CoA/Disconnect ACK, NAK, timeout, retry, Message-Authenticator, serta alur Admin API. MVP monitoring jaringan read-only (TR-F031) dan notifikasi operator WhatsApp berbasis whatsmeow (TR-F030, default nonaktif) juga telah diimplementasikan dan dicatat pada bagian 11; adapter SNMP fisik dan alur WhatsApp dengan nomor uji masih memerlukan validasi operasional. Kesiapan produksi tetap perlu dibuktikan melalui acceptance suite PostgreSQL/Docker dan pilot dengan NAS yang akan dipakai.

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
- **Operasional:** dashboard, operator, settings, monitoring kesehatan perangkat jaringan yang diizinkan, dan notifikasi insiden operasional.

### Tidak termasuk sekarang

Payment gateway, chat bot WhatsApp / layanan pelanggan otomatis, portal pelanggan, ticketing, CRM lanjutan, provisioning/perubahan konfigurasi router, inventaris OLT/ODP/fiber, reseller, voucher/hotspot, laporan lanjutan, pajak/ERP akuntansi, aplikasi mobile, dan multi-tenant. Pengecualian terbatas: notifikasi satu arah untuk operator (TR-F030) dan pembacaan metrik kesehatan perangkat yang didaftarkan (TR-F031).

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

Dashboard menampilkan jumlah customer, subscription aktif/suspend, user online, invoice dan payment bulan ini, outstanding, serta overdue. Detail subscription menampilkan customer, paket/harga, username RADIUS, status/alasan suspend, billing day/grace days, status online/offline, dan aksi operasional. Daftar invoice menyediakan filter customer/status/nomor; daftar payment menampilkan nomor, customer, invoice, nominal, metode, dan tanggal. Bagian Network menampilkan status target yang didaftarkan, latency/loss, status interface dan ringkasan trafik bila perangkat menyediakan SNMP; Alerts menampilkan kondisi yang berubah dan status pengiriman notifikasi.

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

## 9. Grand plan setelah MVP

Prinsip urutan: tutup risiko operasional dan validasi alur lengkap dahulu; baru tambah fitur. Jangan memperluas produk ke payment gateway, CRM, portal pelanggan, atau multi-tenant tanpa revisi ruang lingkup.

### Gelombang A — Uji lokal yang bisa diulang

- Pertahankan fake NAS UDP sebagai simulator perangkat: Access-Request/Accept/Reject, Accounting Start/Interim/Stop, CoA/Disconnect ACK/NAK, secret salah, paket rusak, kehilangan respons, timeout, dan retry.
- Sediakan satu perintah/script terdokumentasi untuk menjalankan skenario MWX end-to-end dengan data uji yang deterministik dan database sementara.
- Acceptance: operator dapat menjalankan simulasi tanpa NAS atau database produksi dan memperoleh ringkasan lulus/gagal yang mudah dibaca.

### Gelombang B — Acceptance dan rilis yang dapat direproduksi

- Jalankan suite integrasi penuh dengan PostgreSQL dan OpenLDAP melalui Docker/CI; selesaikan hambatan lingkungan Docker lokal dengan CI atau mesin yang mendukung Docker.
- Validasi alur Customer → Package/Profile → Subscription/RadiusUser → autentikasi → accounting → invoice → overdue/grace → suspend/disconnect → payment → reactivate.
- Buat prosedur build/release Windows EXE dan deployment server, termasuk konfigurasi, lokasi data/log, upgrade schema, dan backup/restore.
- Acceptance: clean build, unit/integration suite hijau, artefak versi dapat dijalankan dari instalasi bersih, dan backup berhasil dipulihkan pada instance uji.

### Gelombang C — Kesiapan operasional ISP

- Audit keamanan produksi: ganti kredensial bootstrap, kebijakan password operator, permission, secret RADIUS, TLS, audit trail, dan paparan port.
- Pastikan scheduler tahan restart dan proses berulang: pembuatan invoice, overdue, suspend, pembayaran/reactivation tidak menggandakan efek atau melewati periode billing.
- Tambahkan prosedur observabilitas operasional minimum: health check, log yang dapat ditelusuri, status scheduler, serta panduan pemulihan database dan layanan.
- Acceptance: operator dapat mengetahui kegagalan tugas otomatis, mengulang proses dengan aman, dan memulihkan layanan tanpa mengubah data secara manual di database.

### Gelombang D — Monitoring kesehatan jaringan

- Tambahkan registry target yang eksplisit (NAS/router/switch/host), pemeriksaan reachability dan latency/loss, serta polling metrik interface melalui SNMP dengan interval dan retention yang dapat diatur.
- Gunakan SNMPv3 authPriv bila tersedia; SNMPv2c hanya opsi kompatibilitas terbatas dengan secret tersimpan aman. Jangan melakukan network scan otomatis atau menulis konfigurasi ke perangkat.
- Buat status/threshold yang dapat dipahami operator, deduplikasi perubahan status, riwayat insiden, dan tampilan ringkas. Beri label jelas bahwa ICMP gagal tidak selalu berarti perangkat mati.
- Acceptance: fake ICMP/SNMP agent dapat mensimulasikan online/offline, latency, loss, interface down, dan counter trafik; hasil tersimpan, tidak memicu alert berulang tanpa batas, dan tidak pernah mengirim perintah konfigurasi.

### Gelombang E — Notifikasi WhatsApp operator (opsional/eksperimental)

- Implementasikan antarmuka notification provider dan outbox internal terlebih dahulu; event awal dibatasi pada NAS/target down-recovered, kegagalan scheduler, dan billing suspend/reactivate yang penting.
- Adapter whatsmeow mengirim pesan satu arah ke nomor operator yang telah di-allowlist; hindari balasan bot, blast, promosi, atau mengirim rincian/password pelanggan.
- QR pairing dan status koneksi hanya dikelola operator; persist device/session keys terenkripsi atau dilindungi permission OS, dengan prosedur backup, logout/revoke, dan rotasi.
- Terapkan retry terbatas, dedupe, cooldown, antrean saat offline, audit status tanpa menyimpan isi pesan lebih lama dari yang diperlukan, dan alternatif notifikasi bila WhatsApp terputus.
- Acceptance: mock sender memverifikasi retry/dedupe; opt-in nomor uji mengonfirmasi pairing, reconnect, kirim, logout, dan pemulihan dari session store. Fitur tetap nonaktif secara default sampai operator memilih mengaktifkan dan menerima risiko channel.
- whatsmeow adalah implementasi tidak resmi WhatsApp Web multi-device; perubahan protokol dapat memutus integrasi. Ketentuan WhatsApp membatasi akses/penggunaan yang tidak diizinkan. Tinjau ketentuan yang berlaku dan risiko akun sebelum mengaktifkan; jalur WhatsApp Business Platform resmi dapat dipilih untuk kebutuhan produksi yang menuntut dukungan resmi. [Repositori whatsmeow](https://github.com/tulir/whatsmeow), [Ketentuan WhatsApp](https://www.whatsapp.com/legal/terms-of-service), [dokumentasi Cloud API WhatsApp Business](https://developers.facebook.com/docs/whatsapp/cloud-api/overview).

### Gelombang F — Pilot NAS nyata dan cutover

- Catat vendor/model/firmware NAS, RADIUS auth/accounting ports, shared secret, CoA/Disconnect port, atribut identitas sesi, dan kebutuhan vendor VSA.
- Uji satu pelanggan internal lebih dahulu: auth sukses/gagal, accounting start/interim/stop, suspend, disconnect, pembayaran, dan auth ulang setelah reactivate.
- Periksa firewall/routing dua arah, NAS-IP/identifier yang terdaftar, sinkronisasi waktu, serta konsistensi `Acct-Session-Id`.
- Acceptance: catatan uji berisi request/response dan hasil aplikasi, tanpa kredensial sensitif; kegagalan vendor dapat direproduksi dan diperbaiki sebelum pelanggan dipindahkan.

### Gelombang G — Stabilitas dari bukti pemakaian

- Setelah pilot, prioritaskan hanya gap yang terlihat pada data operasional: performa query, rekonsiliasi sesi, laporan billing, atau atribut vendor yang benar-benar dibutuhkan.
- Tinjau backup, retention, ekspor data, dan kapasitas berdasarkan skala pelanggan yang direncanakan.
- Acceptance: setiap tambahan punya kebutuhan nyata, batas penerimaan, dan data yang membuktikan manfaatnya.

## 10. Batas validasi simulator

Fake NAS berbicara lewat UDP sungguhan sehingga menguji encoding paket, secret/signature, respons protokol, timeout/retry, serta integrasi handler aplikasi. Simulator belum membuktikan interoperabilitas firmware vendor, kebijakan jaringan NAS, firewall/routing di lokasi, atau autentikasi ulang pada perangkat sebenarnya. Untuk itu dibutuhkan pilot Gelombang F; perangkat NAS tidak diperlukan untuk melanjutkan Gelombang A–E. Monitoring jaringan nyata memerlukan target jaringan yang dapat dijangkau; perilaku ICMP/SNMP dapat diuji dengan simulator.

## 11. Implementasi TR-F030 / TR-F031 (2026-10-02)

- **TR-F031 MVP tersedia:** target eksplisit ICMP/TCP/SNMP, SNMPv3 authPriv dan SNMPv2c compatibility, secret SNMP terenkripsi memakai stable `web.secret`, maksimum 500 target, maksimum delapan poll simultan, interval 30–3600 detik, sample retensi 30 hari, status threshold, incident history, interface counters read-only, serta halaman Network & Alerts. Tidak ada network scan atau operasi write. Mock Probe menguji interval, status down/recovery, dan persistence; paket SNMP terhadap agent/router belum diuji.
- **TR-F030 MVP tersedia dan default off:** opt-in/risk acknowledgement, maksimal 20 nomor operator, event allowlist, QR pairing/status, pesan satu arah, persistent outbox, dedupe, maksimal lima percobaan, pembatalan antrean saat izin dicabut, histori pengiriman 30 hari, dan UI admin. Login, pair/reconnect/send/revoke WhatsApp sungguhan perlu dilakukan operator dengan nomor uji.
- File database WhatsApp mengikuti kontrol akses dan perlindungan deployment database. Kredensial SNMP memakai AES-GCM dengan `web.secret`; mengganti secret tanpa migrasi membuat kredensial yang telah tersimpan tidak dapat didekripsi.
- Sebelum memakai whatsmeow, tinjau [Terms of Service WhatsApp](https://www.whatsapp.com/legal/terms-of-service). whatsmeow adalah implementasi tidak resmi; untuk dukungan produksi resmi, evaluasi [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/overview).
