# MWX-ISP — Blueprint Produk

**Nama:** MWX-ISP
**Deskripsi:** ISP Management + RADIUS + Billing
**Target:** satu deployment MWX-ISP untuk mengelola beberapa organisasi ISP atau RT/RW Net yang terisolasi, dengan operator platform dan operator tenant.

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

Payment gateway, chat bot WhatsApp / layanan pelanggan otomatis, portal pelanggan, ticketing, CRM lanjutan, provisioning/perubahan konfigurasi router, inventaris OLT/ODP/fiber, reseller marketplace, laporan lanjutan, pajak/ERP akuntansi, dan aplikasi mobile. Multi-tenant hanya termasuk dalam batas isolasi dan migrasi yang disetujui pada TR-F033; reseller marketplace dan hierarki tenant tidak termasuk. Pengecualian terbatas: notifikasi satu arah untuk operator (TR-F030) dan pembacaan metrik kesehatan perangkat yang didaftarkan (TR-F031).

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

Prinsip urutan: tutup risiko operasional dan validasi alur lengkap dahulu; setiap perluasan mengikuti feature checklist. Multi-tenant kini disetujui secara terbatas pada TR-F033; jangan memperluasnya menjadi reseller marketplace, customer portal, atau hierarki organisasi tanpa keputusan ruang lingkup baru.

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

## 12. Rencana onboarding dan panduan operator (TR-F013 / TR-F015)

### Masalah yang hendak diselesaikan

Dashboard saat ini langsung menampilkan metrik RADIUS/ISP dan navigasi modul. Instalasi baru dapat terlihat kosong tanpa memberi tahu operator urutan konfigurasi, hubungan antara RadiusProfile/package/subscription/RadiusUser, kapan layanan benar-benar siap, dan bagian mana yang opsional. Dokumentasi README/blueprint berguna untuk setup teknis, tetapi bukan panduan kerja harian di dalam aplikasi.

### Keputusan produk

Bangun tiga lapisan yang saling melengkapi di dalam satu React Admin app, bukan onboarding modal wajib:

1. **Getting Started di Dashboard:** checklist setup yang ringkas dan dapat dilanjutkan. Tampilkan untuk instalasi yang belum siap; sediakan tautan `Open setup guide` bila operator menyembunyikannya.
2. **User Guide yang selalu tersedia:** route internal `/help` atau `/guide`, ditautkan dari AppBar Help dan Dashboard. Berisi alur, istilah, prasyarat, prosedur, hasil yang harus dilihat, dan batas simulasi/produksi.
3. **Quick tour opsional:** rangkaian maksimal lima langkah, bisa dilewati, diulang dari Help, dan hanya memperkenalkan dashboard, sidebar, alur layanan, billing, serta Operations. Gunakan dialog/stepper yang accessible dengan tautan ke halaman; jangan mengunci operator dalam tooltip coach-mark yang rapuh.

Panduan hanya menjelaskan dan menautkan fitur yang sudah ada. Ia tidak membuat Customer/Package/Invoice sampel otomatis, tidak menguji NAS, tidak memasangkan WhatsApp, dan tidak mengubah konfigurasi saat tour berjalan. Instalasi produksi tidak boleh tampak sudah tervalidasi hanya karena record konfigurasi ada.

### Alur Getting Started untuk Admin

Urutan utama dibuat sebagai setup dari fondasi sampai pelanggan uji:

1. **Amankan akun dan instalasi:** ubah kredensial bootstrap, setujui penggunaan pada jaringan yang tepat, konfigurasi database dan secret aplikasi, serta siapkan backup. Tautkan ke Account Settings/System Configuration; rahasia tidak pernah ditampilkan di guide.
2. **Lengkapi identitas dan billing defaults:** nama perusahaan, IDR, zona waktu `Asia/Jakarta`, due/grace days, auto-suspend, dan auto-reactivate. Jelaskan bahwa auto-suspend dapat memutus akses setelah overdue dan grace habis.
3. **Siapkan RADIUS:** periksa atau buat RadiusProfile; daftarkan NAS dengan alamat, shared secret, port auth/accounting dan CoA yang sesuai. UI hanya mengelola data MWX-ISP; kebijakan/perintah sisi router tetap diterapkan oleh admin perangkat.
4. **Buat Internet Package:** tetapkan harga komersial dan tautkan ke RadiusProfile yang benar. Terangkan bahwa harga package tidak membuat atau mengubah policy perangkat.
5. **Daftarkan Customer dan Subscription:** pilih Customer, Package, billing day/grace, lalu buat RadiusUser baru atau tautkan user lama. Status `pending` perlu diaktifkan; username/password layanan tidak boleh sama dengan akun operator.
6. **Verifikasi akses pada client uji:** lakukan autentikasi dan accounting menggunakan NAS yang memang dikendalikan/diizinkan, kemudian lihat Online Sessions dan Accounting. Tandai sebagai verifikasi manual hanya setelah operator melihat hasil di NAS dan aplikasi.
7. **Kenali siklus billing:** jelaskan pembuatan invoice bulanan oleh scheduler, due date/grace, pencatatan pembayaran manual/parsial, serta kondisi yang dapat memicu suspend/reactivate. Jangan menganjurkan pembayaran sungguhan sebagai demo.
8. **Opsional — monitoring dan alert:** daftarkan target jaringan yang secara eksplisit disetujui; jelaskan ICMP/TCP/SNMP dan secret SNMP. WhatsApp tetap default off, perlu risk acknowledgement, allowlist operator dan pairing nomor uji.

### Alur untuk Operator harian

Tour singkat memperkenalkan Dashboard → Customers/Subscriptions → Online Sessions/Accounting → Invoices/Payments. Setiap langkah menandai apakah tindakan hanya bisa dilakukan Admin. Bila route menolak akses tulis, teks panduan menjelaskan peran yang diperlukan dan memberi tautan baca yang tetap tersedia; panduan tidak menjanjikan aksi yang tidak diizinkan role tersebut.

### Status progres dan penyimpanan

- Status yang dapat dihitung dari endpoint existing—misalnya adanya profile, NAS, package, customer, atau subscription—ditampilkan sebagai **Not configured / Configured**. Ini hanya menunjukkan record ada, bukan bahwa RADIUS atau vendor telah lolos uji.
- Hal yang memerlukan observasi perangkat—auth/accounting sukses, CoA/NAS behavior, autentikasi ulang—ditandai **Operator verification required**. Tidak ada klaim otomatis berdasarkan jumlah record atau fake test.
- Monitoring dan WhatsApp diberi label **Optional**. Langkah ini tidak menahan penyelesaian setup inti.
- Simpan hanya pilihan UI `tour seen`, `guide collapsed`, dan centang manual progres pada localStorage per identitas operator. Jangan simpan password, shared secret, data pelanggan, atau bukti produksi di sana. Beri keterangan bahwa progres manual hanya berlaku di browser/perangkat tersebut; jangan menambah tabel backend hanya untuk checklist awal.
- Bila endpoint status gagal dimuat, tampilkan **Unable to check** dengan retry, bukan angka nol yang memberi kesan data kosong.

### Struktur halaman User Guide

1. **Start here:** diagram Customer → Package/Profile → Subscription/RADIUS User → Invoice/Payment.
2. **Configure RADIUS and NAS:** prasyarat, field yang diperlukan, port/secret, apa yang diatur dalam MWX-ISP vs router, serta titik verifikasi.
3. **Customer and service lifecycle:** Package/Profile, Customer, Subscription, status, user lama vs user baru, suspend/reactivate/terminate.
4. **Billing operations:** invoice otomatis, format nomor otomatis, status invoice, pembayaran parsial/penuh, grace period dan dampak auto-suspend.
5. **Daily operations:** online sessions, accounting, current IP, disconnect/CoA, log/status, Network & Alerts.
6. **Optional integrations:** monitoring yang read-only dan target eksplisit; WhatsApp eksperimental/default-off beserta pairing, allowlist, risiko dan cara unlink.
7. **Production readiness and troubleshooting:** checklist pilot NAS, kesalahan secret/port/routing/time, backup/restore, log, batas simulator, dan kapan eskalasi ke admin.

### Tahap pelaksanaan

- **I.1 — Audit konten dan permission:** tautkan setiap panduan ke route/field/role yang benar; identifikasi label status dan aturan billing yang harus tetap identik dengan backend.
- **I.2 — Bangun panduan internal:** satu halaman English dengan sidebar/anchor per bab, search sederhana bila konten cukup panjang, tautan ke modul dan layout responsif.
- **I.3 — Dashboard checklist:** tampilkan tahap setup, badge state dengan definisi jelas, aksi lanjut, retry/error/empty state, serta collapse/reopen.
- **I.4 — Quick tour:** lima langkah maksimum, keyboard accessible, bisa skip/close/replay, dan tidak menutupi form atau mengeksekusi mutation.
- **I.5 — Copy/visual pass:** screenshot review dark default, light preference, desktop, tablet, mobile; pastikan tidak membanjiri dashboard padat data.
- **I.6 — Verifikasi:** simulasi fresh install, instalasi parsial, konfigurasi lengkap tanpa NAS, dan role operator/admin; validasi link, state, no fake completion, dan tidak ada error console.

### Kriteria penerimaan

- Admin baru dapat mengikuti langkah dari Dashboard tanpa harus menebak urutan modul; tiap langkah membuka route yang sudah ada.
- Operator lama dapat menutup checklist/tour dan membukanya kembali tanpa mengubah data bisnis.
- Progress konfigurasi tidak menyamakan record NAS dengan autentikasi live yang berhasil.
- Semua aksi berisiko—default password, suspend, secret, WhatsApp pairing dan konfigurasi NAS—menyebut dampaknya dan tetap memerlukan aksi operator yang sesuai.
- Panduan menandai WhatsApp/monitoring sebagai opsional dan fake/synthetic data sebagai simulasi, bukan validasi NAS produksi.
- Konten konsisten dengan blueprint, English UI, permission existing, format nomor otomatis, serta aturan IDR/timezone/grace period.
- Quick tour dan halaman guide bisa digunakan dengan keyboard, pada ukuran layar kecil, tanpa overlay yang memblokir navigasi.

### Batas ruang lingkup

Tidak membuat demo mode yang meniru traffic nyata, workflow wizard yang menulis konfigurasi otomatis, integrasi telemetry/help analytics, backend progress API, knowledge base eksternal, atau sistem ticketing. Pada database yang benar-benar kosong, sampel bisnis sintetis dibuat otomatis satu kali sesuai TR-F032; instalasi yang sudah berisi data operasional/bisnis tidak diubah (akun bootstrap dan node bawaan tidak dihitung). Target network dan akun RADIUS contoh tetap disabled, memakai data yang ditandai, dan tidak menyertakan hasil probe/live-session palsu.

## 13. Audit konsistensi visual dan rencana branding per instalasi

### Temuan audit kode saat ini (2026-10-04)

- `web/src/theme.ts` sudah menyediakan tema gelap default, palet hijau, token status, dan gaya global MUI; ini fondasi yang baik untuk mempertahankan karakter MWX yang teknis dan padat data.
- Sejumlah halaman/resource masih mendefinisikan warna, gradient, radius, shadow, dan aksen secara lokal. Beberapa contoh mencampur nilai biru Material (`#1976d2`, `#0288d1`), merah/hijau status literal, aksen oranye/teal/lime, dan radius dari 1 sampai 4. Akibatnya halaman tidak seluruhnya mengikuti token tema dan branding warna tidak bisa diterapkan seragam.
- Permukaan merek menggandakan nilai tetap: nama/monogram pada AppBar, nama footer sidebar, halaman Login, `Admin title`, `index.html` title, favicon dan label loading. Mengubah satu tempat saat ini tidak mengubah semuanya.
- Nama perusahaan dan informasi invoice memang dapat dikonfigurasi melalui `isp.company_*`, tetapi itu adalah identitas penagih. Nilai tersebut belum mengubah nama produk, logo, aksen UI, atau favicon dan tidak boleh diam-diam digunakan sebagai pengganti merek aplikasi.
- Tema MUI dibangun dari preset dark/light statis. Belum ada editor branding per instalasi, preview, reset ke MWX default, atau sumber tunggal untuk logo dan nama produk.
- Referensi visual yang diminta: `X:\REPO\focus\moonwitness\apps\board` (MoonWitness Board). `src/index.css` mendefinisikan tema manga/ink dengan paper/ink berkontras tinggi, aksen lime dan hot pink, palet invers untuk dark mode, halftone/grain, border tegas, offset hard shadow, serta font display/body/mono yang berbeda. `src/components/manga/effects.tsx` menambahkan speed lines, scribble underline, doodle, rough frame, dan speech bubble; `src/components/layout/app-shell.tsx` memakai active nav seperti sticker dan shadow offset.
- Arah visual MWX yang direncanakan menjadi **manga-ink enterprise**: ambil bahasa visual MoonWitness—kontras paper/ink, outline yang tegas, hard shadow pendek, aksen lime yang khas, micro-label mono, judul display, dan tekstur/halftone—lalu adaptasikan pada dashboard operator yang padat. Dark tetap default MWX; lime menjadi highlight brand, sementara pink hanya aksen dekoratif terbatas. Warna semantic status tetap hijau/amber/merah yang mudah dipahami. Terapkan efek komik besar (speed lines, marker, doodle/sticker) hanya pada hero, empty state, atau active selection yang tepat; hindari animasi/rough border di tabel, form, dialog konfirmasi, serta angka operasional.
- Konsistensi saat ini juga mencakup bukan hanya warna: radius dan density berbeda antar komponen; kartu dan hero lokal mengulang gradient/shadow; hierarchy typography dan label uppercase belum punya aturan lintas halaman. Keseragaman harus memasukkan bentuk, border weight, offset shadow, typography, micro-label, hover/focus/pressed behavior, serta reduced-motion.

### Hasil produk yang dituju

1. **Visual konsisten:** halaman menggunakan token MUI dan komponen bersama untuk surface, section heading, metric, status, form, data table, dan page header. Karakter manga-ink tetap tampak, tetapi pola visual dan intensitas efek punya aturan jelas untuk menjaga fokus kerja profesional.
2. **Branding editable per instalasi tunggal:** Admin dapat mengganti nama produk yang terlihat, nama ringkas/monogram, tagline, logo, dan warna aksen utama; UI memperbarui header, login, footer, browser title, favicon, dan tema tanpa rebuild frontend.
3. **Default aman:** nilai awal tetap MWX-ISP, dark theme, hijau MWX, dan aset MWX. Admin dapat preview sebelum simpan dan reset identitas produk ke default. Brand aplikasi tidak mengubah nama legal/perusahaan pada invoice.
4. **Batas arsitektur:** branding produk MWX tetap global per deployment. TR-F033 mengizinkan identitas perusahaan dan invoice per tenant, tetapi tidak mengizinkan tema produk, white-label, marketplace tema, plugin branding, atau CSS bebas per tenant.

### Tahapan rencana

- **J.1 — Baseline visual:** audit semua route aktif dan bandingkan langsung dengan `moonwitness/apps/board`; petakan token paper/ink/lime/pink/dark, font display/body/mono, halftone, border 2px, offset shadow, active sticker, speedline, reduced motion. Buat matriks adaptasi (adopt / tone down / skip), lalu ambil screenshot dashboard/login/resource pada dark/light serta viewport lebar/sempit. Tetapkan kontras, fokus keyboard, dan aturan kepadatan data.
- **J.2 — Sumber token tunggal:** perluas `theme.ts` dengan token semantik (ink/surface, brand lime, decorative pink, border, hard shadow, focus, data-series, state, type scale) dan theme factory. Tetapkan palet gelap sebagai default; light mode membalik paper/ink dengan aksen identitas yang konsisten. Branding accent yang dapat diedit tetap dibatasi agar tidak menimpa status success/warning/error atau teks kontras.
- **J.3 — Komponen/pola bersama:** rapikan page header display + underline/highlighter terbatas, section rail, metric card border tegas + hard offset shadow ringan, micro-label mono, toolbar/filter, status chip, form section, data table, empty/loading/error state. Gunakan scale border/radius/elevation konsisten dan perilaku hover/pressed tactile yang halus. Migrasi bertahap—shell/login/dashboard; ISP/billing; RADIUS/network; system/operations—tanpa efek berulang yang mengganggu pemindaian.
- **J.4 — Scope branding dan penyimpanan:** TR-F029 bilingual kini mencakup identitas configurable per deployment dengan batas satu instalasi. Tabel product-brand terpisah dari `isp.company_*` menyimpan product name, short name, tagline, logo reference, dan accent; logo diunggah lewat endpoint Admin sebagai PNG maksimum 1 MiB dan 2048×2048, nama file acak di data directory, tanpa SVG arbitrer atau CSS bebas.
- **J.5 — Editor branding Admin:** di halaman Product Branding untuk Admin, field nama/mark/tagline, picker aksen, upload/hapus PNG, preview live shell/login, Save/Reset to MWX defaults dengan konfirmasi. Mutasi dilindungi Admin; endpoint baca brand/logo memang publik untuk shell/login.
- **J.6 — Runtime propagation:** branding publik dimuat sebelum shell render; AppBar, login, menu, judul, favicon, loading dan theme provider menggunakannya. API dan frontend fallback pada konfigurasi hilang/warna invalid; Save/Reset memperbarui state aplikasi langsung.
- **J.7 — Audit/migrasi visual:** ganti literal dekoratif yang bertentangan dengan token, bukan warna status semantik. Terapkan halftone/grain rendah kontras pada background/hero saja; speedlines, doodles, scribble dan marker hanya sebagai aksen kontekstual non-data; jangan memutar badge/status operasional. Hard shadow pendek dan border ink harus menguatkan hierarchy, bukan mengelilingi setiap cell. Angka/status tetap lebih menonjol daripada hiasan; tabel responsif tidak kehilangan kolom kunci. Patuhi `prefers-reduced-motion` dan hindari gerakan dekoratif berulang.
- **J.8 — Verifikasi:** cek dark/light × default/custom brand × desktop/tablet/mobile, halaman Login, Dashboard, semua resource, Operations, dan System Config; uji role Admin/operator, preview/cancel/save/reset, logo invalid/oversized/offline, config lama/kosong, reload, aksesibilitas keyboard/contrast, console, build dan browser journey. Branding tidak boleh mengubah data billing, secret RADIUS/SNMP, atau hasil otorisasi.

### Batas dan keputusan yang perlu dipertahankan

- Baseline manga-ink dan branding configurable TR-F029 sudah diimplementasikan pada main; tetap gunakan adaptasi MUI dan jangan menyalin identitas/aset MoonWitness.
- MoonWitness Board adalah referensi bahasa visual saja. Jangan menyalin identitas produk MoonWitness, logo, teks/asset, atau implementasi komponen dan dependensinya; adaptasikan motif dengan MUI dan struktur React Admin MWX yang telah ada.
- Perubahan TR-F029 sudah dicatat pada kedua feature checklist sebelum implementasi.
- Tidak mengubah company/billing identity, format invoice, warna status semantik, ACL, atau data bisnis hanya karena Admin mengubah product brand.
- Upload logo sebaiknya menerima format raster yang disetujui (contoh PNG/WebP) dengan ukuran maksimum eksplisit dan hanya dapat diakses sebagai file statis pasif; bila SVG diminta kelak, perlu sanitasi/allowlist tersendiri.

### Kemajuan implementasi visual (2026-10-04)

- Baseline manga-ink sudah diterapkan pada theme MUI, shell/menu, loading/login, dashboard, onboarding, guide, Operations, System Config, Account Settings, dan kartu/panel di resource RADIUS, accounting, ISP, network, serta certificates. Radius besar diseragamkan menjadi bentuk kompak; status tetap memakai semantic success/warning/error.
- Wiring tema Admin kini memakai `darkTheme` eksplisit dan `defaultTheme="dark"`; penggunaan prop `theme` lama sebelumnya membuat tombol light/dark mengganti pilihan tanpa mengganti palet. Light mode memakai aksen dan warna seri grafik dengan kontras lebih tinggi.
- Pemeriksaan browser dengan Admin bootstrap pada database SQLite sementara (folder temp, RADIUS listener off) mencakup Dashboard, Guide, Operations, System Config, Account Settings, RADIUS Users, Customer, dan Invoice. Tidak ada data bisnis yang dibuat. Account Settings overflow 27 px pada viewport 529 px juga sudah diperbaiki.
- Build/type-check lulus dan screenshot runtime mengonfirmasi dark/light serta layout sempit untuk halaman yang diuji. Audit desktop lebar, operator role, semua routes, dan data parsial/lengkap tetap terbuka.
- Editor branding, penyimpanan konfigurasi satu instalasi, validasi/upload PNG, reset dan propagasi runtime telah diimplementasikan; API test berjalan. Browser runtime end-to-end halaman branding masih perlu diverifikasi dengan backend terisolasi.

### Kriteria penerimaan rencana implementasi

- Semua lokasi yang menampilkan brand memakai satu konfigurasi dan kembali ke MWX-ISP saat konfigurasi hilang atau di-reset.
- Warna aksen custom tetap terbaca di dark dan light; state sukses/peringatan/error dan warna seri data tidak tertukar dengan brand.
- Preview tidak menyimpan perubahan; Save bertahan sesudah reload; Reset memulihkan seluruh default UI brand.
- Logo invalid/terlalu besar ditolak dan logo yang gagal dimuat menggunakan fallback tanpa merusak layout.
- Audit tiap grup halaman menunjukkan konsistensi komponen, kepadatan data, akses keyboard, dan kontras tanpa merombak proses kerja RADIUS/ISP.
- Checklist, README/blueprint, label dan bantuan selaras; identitas invoice tetap terpisah dari identitas produk.

## 14. Sample data otomatis untuk instalasi baru dan aman untuk uji (TR-F032)

- Startup pertama mendeteksi database yang sepenuhnya kosong lalu membuat sample data otomatis dalam satu transaksi. Instalasi yang mempunyai operator atau record operasional/bisnis dilewati; startup berikutnya tidak mengulang seed.
- Daftar konfigurasi/bisnis utama diisi 3–6 baris berlabel Sample/demo. Identitas Customer dan Subscription mengikuti format ID-based aplikasi; invoice/payment menggunakan layanan sequence resmi.
- Seeder memakai marker `demo-seed`; executable CLI tetap tersedia untuk refresh eksplisit pada database uji dan mode `-clean` hanya menghapus record terkait serta mempertahankan counters sequence.
- Network target contoh memakai alamat dokumentasi dan `enabled=false`; tidak ada sample probe/history yang dibuat.
- Online sessions, test certificates, operator account, WhatsApp session/outbox, dan secret/operator credentials tidak disimulasikan. Accounting history sintetis yang ber-marker hanya untuk visualisasi chart.
- NAS dan RadiusUser sample dibuat disabled; password RADIUS contoh `123456` tidak bisa dipakai sampai operator mengaktifkannya. Tetap tandai data sebagai sintetis dan jangan gunakan pada layanan/customer nyata.
- Verifikasi wajib mencakup run dua kali, cleanup, relasi Customer→Subscription→RADIUS User dan Package→Profile, sequence invoice/payment, serta data tanpa marker yang dipertahankan.

## 15. Isolasi organisasi ISP / RT/RW Net (TR-F033)

- Gunakan satu deployment dan PostgreSQL shared-schema dengan tenant ID eksplisit pada data tenant. Branding produk MWX tetap global; identitas perusahaan dan invoice berada dalam ruang lingkup tenant.
- Data lama dimigrasikan ke organisasi `default` tanpa mengganti ID, kata sandi, relasi bisnis, atau nomor pelanggan/dokumen yang sudah ada. Migrasi harus idempoten dan dapat dipulihkan dari backup sebelum tenant kedua dibuat.
- Nama login pelanggan RADIUS, nomor customer, kode paket, nomor subscription/invoice/payment, sequence dokumen, nama target monitoring, kunci deduplikasi notifikasi, dan ID session boleh berulang antar-tenant namun tetap unik pada tenant yang sama.
- Fondasi, login tenant, scope ORM, resolusi NAS-first, billing scheduler, monitoring/notifikasi, demo cleanup, dan acceptance PostgreSQL ada di branch `dev`. Konsol tenant awal membatasi bootstrap platform dengan flag eksplisit, membuat organisasi beserta admin awal, serta menonaktifkan tenant memakai status. CoA/Disconnect tenant dan backup/restore lintas organisasi kini memiliki implementasi serta acceptance PostgreSQL; backup mempertahankan metadata tenant dan kredensial monitoring terenkripsi, dan sesi online dibangun ulang saat perangkat tersambung kembali. Tenant membership, retention ownership, acceptance lintas domain/IDOR, handbook operasional, dan promosi ke `main` masih berjalan. Jangan anggap siap multi-tenant produksi sampai M15.1–M15.7 lulus dan merge ke `main`.
- Bootstrap platform opsional memakai `MWX_PLATFORM_ADMIN_USERNAME` dan `MWX_PLATFORM_ADMIN_PASSWORD`; tidak ada akun/platform password default. Akun harus dibuat atau diverifikasi di tenant default dan mendapat flag platform hanya melalui konfigurasi deployment. Tenant baru dibuat bersama operator `super` pertamanya dan dinonaktifkan dengan status, bukan dihapus.
- NAS RADIUS harus dapat dipetakan secara tidak ambigu berdasarkan sumber paket sebelum secret dibaca. Untuk tahap awal, alamat IP sumber NAS harus unik pada listener bersama; alamat yang ambigu ditolak, bukan dipilih dengan urutan query.
- Operator platform dapat mengelola organisasi; operator tenant hanya melihat dan mengubah tenant aktifnya. Tenant ID dari request tidak menjadi otoritas, relasi silang tenant ditolak, dan semua aksi RADIUS/CoA mengikuti tenant NAS yang tervalidasi.
- Validasi akhir mencakup PostgreSQL, duplikasi nama RADIUS lintas tenant, migrasi data legacy, kontrol IDOR, billing/sequences, monitoring/notifikasi, Accounting, CoA/Disconnect, backup/restore, serta EN/ID handbook.
