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
- [x] Flow aplikasi untuk membuat Customer, Subscription, dan RadiusUser serta mengaktifkan layanan sudah tersedia.
- [ ] Verifikasi autentikasi RADIUS end-to-end dengan NAS riil masih perlu dilakukan saat deployment.
- [x] Invoice dapat dibuat dan menampilkan total, tanggal jatuh tempo, serta saldo.
- [x] Overdue + grace habis men-suspend subscription dan menonaktifkan RadiusUser; scheduler mencoba disconnect sesi aktif dengan CoA.
- [x] Pembayaran penuh menandai invoice paid serta mengaktifkan kembali subscription dan RadiusUser bila setting auto-reactivate aktif.
- [ ] Uji autentikasi ulang pelanggan setelah reactivation dengan NAS riil masih perlu dilakukan saat deployment.

## Pemeriksaan pematangan lokal

- [x] Pertahankan password admin pada restart/upgrade; bootstrap instalasi baru tetap `admin/admin`, sementara password custom dan password bootstrap lama tidak dirotasi diam-diam.
- [x] Jadikan English satu-satunya locale yang dimuat aplikasi; perbaiki teks fallback UI yang tercampur bahasa.
- [x] Tambahkan regresi otomatis untuk nomor invoice/payment lintas periode dan kode package otomatis.
- [x] Simulasikan CoA/Disconnect melalui fake NAS UDP: ACK, NAK, timeout/retry, serta validasi Message-Authenticator.
- [x] Simulasikan alur Admin API untuk disconnect dan perubahan authorization dengan fake NAS UDP.
- [ ] Pastikan job integration PostgreSQL/OpenLDAP pada CI lulus untuk perubahan terbaru; job sudah tersedia, tetapi belum dijalankan lokal karena Docker daemon tidak aktif.
- [ ] Verifikasi autentikasi dan accounting paket end-to-end pada server RADIUS lokal, selain uji CoA/Admin API yang sudah lulus.
- [ ] Uji autentikasi ulang pelanggan setelah reactivation dengan NAS nyata sebelum produksi; ini pilot kompatibilitas, bukan penghalang untuk pengembangan lokal.

## Grand plan pasca-MVP

### A. Simulator yang bisa diulang

- [ ] Sediakan satu perintah/script simulasi lokal dengan fixture deterministik dan database sementara.
- [ ] Lengkapi fake NAS untuk auth accept/reject, accounting start/interim/stop, secret salah, paket invalid, dan respons hilang.
- [ ] Cetak hasil skenario dengan ringkasan pass/fail serta instruksi menjalankan ulang.

### B. Acceptance dan distribusi

- [ ] Pastikan suite integrasi PostgreSQL/OpenLDAP penuh pada CI lulus untuk perubahan terbaru; job CI sudah dikonfigurasi.
- [x] Tambahkan acceptance scenario untuk alur customer, paket, subscription/RADIUS user, invoice idempotent, overdue/grace, suspend/reject, accounting start/stop, pembayaran, reactivation, dan auth ulang.
- [ ] Verifikasi acceptance scenario lifecycle ISP pada PostgreSQL/OpenLDAP di CI; eksekusi lokal tetap menunggu Docker aktif.
- [x] Otomatiskan build Windows EXE dalam release workflow dan build matrix CI (AMD64); clean-checkout release tetap perlu dibuktikan bersama prosedur upgrade/backup.
- [ ] Buktikan backup/restore dan upgrade database pada instalasi uji.

### C. Kesiapan operasional

- [ ] Audit kredensial bootstrap, password operator, hak akses, secret, TLS, port, dan audit log untuk deployment produksi.
- [ ] Verifikasi scheduler tahan restart/idempotent untuk invoice, overdue, suspend, payment, dan reactivation.
- [ ] Tambahkan health/status scheduler dan runbook pemulihan layanan/database.

### D. Monitoring kesehatan jaringan (TR-F031)

- [x] Tetapkan target dan credential secara eksplisit; utamakan SNMPv3 authPriv dan jangan lakukan network scan otomatis.
- [x] Implementasikan pemeriksaan reachability/latency/loss dan polling status interface/counter trafik SNMP read-only.
- [x] Tampilkan riwayat, threshold, perubahan status, dedupe alert; ICMP failed ditampilkan sebagai probe failure, bukan bukti perangkat mati.
- [ ] Buat fake SNMP agent end-to-end; pengujian saat ini memakai mock Probe dan belum mensimulasikan paket SNMP.
- [x] Pastikan tidak ada operasi write/provisioning ke router; batasi 500 target, delapan poll bersamaan, 30–3600 detik interval, timeout maksimal 10 detik, dan 30 hari retensi sample.
- [ ] Uji terhadap router/SNMP agent yang diizinkan saat deployment.

### E. WhatsApp operator via whatsmeow (TR-F030, opsional/eksperimental)

- [x] Buat notification-provider interface dan persistent outbox sebelum adapter transport.
- [x] Implementasikan QR pairing/status koneksi, kirim satu arah, reconnect, logout, dan penyimpanan sesi pada database aplikasi.
- [x] Batasi tujuan ke maksimum 20 nomor operator allowlist; tidak ada blast/promosi/chatbot dan pesan tidak memuat password atau data pelanggan.
- [x] Terapkan retry terbatas, dedupe per event/nomor, audit status pengiriman, pembatalan antrean saat setting/allowlist dicabut, dan pruning histori 30 hari.
- [x] Uji dengan mock sender; alur pair/send sungguhan masih memerlukan operator untuk memasangkan nomor uji dan menerima risiko library/protokol tidak resmi.
- [x] Tinjau Terms of Service WhatsApp; untuk kebutuhan produksi dengan dukungan resmi, evaluasi WhatsApp Business Platform sebagai adapter alternatif.

### F. Pilot NAS nyata

- [ ] Catat model/firmware, alamat dan shared secret NAS, port auth/accounting/CoA, routing/firewall, serta atribut vendor.
- [ ] Jalankan pilot dengan pelanggan internal: auth, accounting, suspend/disconnect, payment, reactivate, dan auth ulang.
- [ ] Simpan bukti hasil tanpa secret/password dan tutup gap kompatibilitas sebelum cutover pelanggan.

### G. Stabilitas berbasis penggunaan

- [ ] Setelah pilot, kumpulkan gap operasional/performa dan prioritaskan berdasarkan bukti, bukan menambah modul di luar scope.
- [ ] Tinjau kapasitas, retention, ekspor data, dan jadwal backup terhadap target jumlah pelanggan.

### H. Audit konsistensi UI dan pemadatan informasi

- [x] Samakan label, status badge, referensi relasi, dan format mata uang pada halaman ISP.
- [x] Hilangkan metrik dashboard yang berulang dan sediakan empty/error state pada grafik.
- [x] Pastikan chart dashboard, target jaringan, histori probe, metrik interface, insiden, dan riwayat notifikasi terbaca saat fixture simulasi tersedia.
- [x] Perbaiki pembacaan respons Operations agar target, histori, insiden, dan outbox tidak salah tampil kosong.
- [x] Pertahankan input allowlist WhatsApp selama polling status berkala.
- [x] Verifikasi route login tanpa sesi dan route Operations dengan identitas admin simulasi di browser tanpa error JavaScript.
- [x] Ganti relasi ID mentah pada detail invoice/payment dengan nomor customer, subscription, dan invoice yang dapat dibuka.
- [x] Pastikan `getMany` memuat record berdasarkan ID yang diminta agar ReferenceField tidak bergantung pada filter list yang tidak didukung semua API.
- [x] Hubungkan filter Customer, Package, Subscription, Invoice, dan Payment yang sudah didukung backend ke daftar UI.
- [x] Pastikan filter Customer dan Invoice Status tersedia melalui filter panel Invoice; nomor invoice dapat dicari langsung dari daftar.
- [x] Hapus locale China yang tidak digunakan serta dukung nomor telepon internasional E.164 pada profil Operator, sambil mempertahankan format nomor tersimpan lama.
- [x] Rapikan header pada viewport mobile; cek detail payment pada lebar 390 px tanpa wrap/overflow.
- [ ] Periksa filter status/customer/nomor di semua daftar dan alur form pada browser kedua serta ukuran tablet.
- [ ] Lakukan inspeksi visual lintas browser, ukuran layar, dan semua resource memakai sesi/data operasional representatif.
- [ ] Konfirmasi tata letak serta skala informasi dengan operator setelah pilot deployment.

### I. Onboarding dan user guide (TR-F013 / TR-F015)

- [x] Audit urutan kerja Admin/Operator, permission yang benar-benar berlaku, link route, kondisi awal, dan istilah yang terlihat dalam UI.
- [x] Tulis konten panduan English: setup awal; Profile/NAS; Package; Customer/Subscription/RadiusUser; auth/accounting; billing/payment; operasi harian; monitoring/WhatsApp opsional; production readiness/troubleshooting.
- [x] Buat Dashboard Getting Started card sesuai status setup, dapat di-collapse/dibuka lagi, dan link ke langkah relevan.
- [x] Buat halaman Help/User Guide internal `/guide` dengan navigasi bab, deep link per modul, dan penanda Admin.
- [x] Buat quick tour opsional lima langkah, keyboard accessible melalui dialog, bisa dilewati/diulang, tanpa menjalankan mutation atau menutupi form.
- [x] Tampilkan hitungan record `Configured` terpisah dari verifikasi autentikasi/accounting NAS live; endpoint gagal menjadi `Unable to check`, bukan nol.
- [x] Simpan hanya preferensi tour/collapse dan centang manual di localStorage per operator; tidak menyimpan data bisnis atau secret dan menjelaskan progress lokal.
- [x] Review copy untuk dampak pengaturan billing, secret jaringan, WhatsApp opsional, serta batas simulasi dan verifikasi produksi.
- [ ] Periksa dashboard/guide di tablet dan role Operator, termasuk data parsial/lengkap. Admin sempit (529 px), dark/light, dashboard, guide, Operations, System Config, Account Settings, RADIUS Users, Customer, dan Invoice sudah dibuka memakai instalasi SQLite sementara; empty states benar dan tidak ada error JS baru setelah backend siap.
- [x] Pastikan panduan tidak membuat seed data dan tidak menyebut simulasi sebagai validasi produksi.

### J. Audit visual konsisten dan branding yang dapat dikonfigurasi (TR-F029)

- [x] Audit sumber theme, shell, login, dashboard, config perusahaan, favicon/title, dan literal warna/radius/shadow.
- [x] Audit referensi `X:\REPO\focus\moonwitness\apps\board`: manga-ink paper/dark, lime/pink, display/body/mono typography, halftone, bold outline, offset hard shadow, active sticker, doodle/speedlines, dan reduced motion.
- [x] Tetapkan adaptasi manga-ink enterprise: dark MWX sebagai default, lime sebagai highlight, pink dekoratif terbatas, border dan hard shadow konsisten, data padat mudah dipindai, serta state operasional tetap semantik.
- [x] Pisahkan branding produk dari identitas perusahaan/penagih invoice; ubah satu instalasi secara global tanpa menambah multi-tenancy.
- [x] Rancang adaptasi referensi tanpa menyalin branding/aset MoonWitness, token theme, komponen konsisten, editor Admin, preview/save/reset, propagasi runtime, fallback, batas keamanan upload logo, dan matriks verifikasi pada blueprint bagian 13.
- [x] Terapkan baseline manga-ink pada theme bersama, AppBar/Menu, Login, Dashboard, serta komponen section form/detail; dark tetap default dan warna status tetap semantik.
- [x] Migrasikan radius card, panel, section, dan grup konten resource RADIUS, accounting, operator, NAS, node, certificate, online session, ISP, Operations ke bentuk square-kompak; samakan aksen heading System Config dengan semantic palette.
- [x] Hilangkan warna aksen lama pada layar loading, status Account Settings, onboarding, dan hover baris data; seluruhnya kini memakai token theme/semantic MUI.
- [x] Verifikasi dark mode desktop untuk Dashboard, Getting Started, dan seluruh User Guide dengan Admin simulasi; halaman tampil tanpa error JavaScript.
- [x] Jalankan `npm run type-check`, `npm run build`, `go build ./...`, `go test ./...`, dan `git diff --check` setelah baseline visual.
- [x] Ulangi type-check, production build, dan `git diff --check` setelah audit warna tambahan.
- [x] Verifikasi langsung theme toggle setelah wiring `darkTheme`/`lightTheme` diperbaiki; sebelumnya `theme` lama memetakan kedua pilihan ke palet gelap.
- [x] Perbaiki kontras aksen utama dan seri grafik pada light mode; screenshot menunjukkan tab/link lime sebelumnya terlalu terang di atas paper.
- [x] Perbaiki overflow horizontal 27 px di Account Settings pada viewport 529 px dengan grid form yang responsif.
- [x] Inspeksi browser runtime Dashboard, User Guide, Operations, System Config, Account Settings, RADIUS Users, Customer List, dan Invoice List pada empty database terisolasi; tidak menambah data bisnis.
- [x] Verifikasi tema light/dark pada Operations, User Guide, Dashboard, dan System Config; Account Settings light mode tanpa overflow sesudah perbaikan.
- [ ] Selesaikan satu audit browser lintas seluruh route/resource pada desktop, tablet, Admin/Operator, dan data parsial/lengkap; cakup filter/form, empty/loading/error states, keyboard/focus, dan kontras. Audit saat ini sudah mencakup sebagian route dengan Admin pada SQLite; Operator dan seluruh kombinasi belum diperiksa.
- [x] Selaraskan scope TR-F029 dalam checklist CN/EN agar mencakup konfigurasi brand per deployment dengan batas single-instance.
- [x] Implementasikan baseline visual, editor brand Admin, penyimpanan aman, preview/save/reset, dan propagasi runtime; default tetap MWX green dan dark theme.
- [x] Uji API default/custom brand, Admin authorization, upload/read PNG, reject SVG, reset, JWT skip; runtime Admin default/custom Save/Reset, product title/shell propagation, dashboard data sample, customer sample list, dan User Guide tanpa console error.

### K. Data contoh bisnis otomatis untuk instalasi baru (TR-F032)

- [x] Seed otomatis satu kali ketika belum ada record operasional/bisnis (akun bootstrap admin dan node bawaan tidak menghalangi); instalasi dengan data nyata dilewati, dan penanda startup mencegah seed ulang.
- [x] Sediakan contoh otomatis 3–6 untuk daftar utama (Node, NAS, Profile, RadiusUser, Customer, Package, Subscription, Invoice, Payment) dan target monitor disabled; akun/NAS contoh disabled demi keamanan.
- [x] Buat seed idempotent dan bersihkan hanya record demo; invoice/payment memakai sequence service resmi.
- [x] Uji seed berulang, relasi referensial, jumlah contoh, urutan dokumen otomatis, dan bukti bahwa data tanpa marker tidak dihapus.
- [x] Dokumentasikan bootstrap data otomatis sehingga user tidak perlu menjalankan executable kedua; CLI tetap opsional untuk perawatan/cleanup.
- [x] Pastikan panduan aplikasi menjelaskan kapan sampel ditambahkan otomatis, penanda sintetis, disabled credentials, dan batas simulasi monitoring/NAS.

Urutan penutupan yang disarankan: (1) pastikan CI lint/test/integration/build lulus untuk perubahan sekarang; (2) lengkapi audit UI Operator/tablet/keyboard; (3) siapkan dan buktikan prosedur deployment, backup/restore, upgrade, serta scheduler/runbook; (4) jalankan fake SNMP dan simulator NAS yang dapat diulang; (5) lakukan pilot NAS dan pairing WhatsApp uji sebelum dipakai operasional. Butir 1–4 dapat dikerjakan tanpa NAS pelanggan; polling live perlu target yang diizinkan, sedangkan kompatibilitas vendor dan cutover butuh perangkat nyata. Jangan menambah modul baru sebelum gap pilot dan penggunaan menunjukkan kebutuhan.

Catatan hasil terbaru (2026-10-02): tes CoAService terpilih dan tes Admin API disconnect/authorization berhasil dijalankan lokal dengan fake NAS UDP. Acceptance scenario ISP ditambahkan ke `test/integration/isp_lifecycle_test.go` untuk memeriksa satu siklus customer sampai auth ulang plus accounting start/stop. `go test ./...`, `go vet ./...`, frontend production build, dan kompilasi paket integration bertag berhasil pada putaran sebelumnya; audit ini juga menjalankan `go test` terpilih untuk validasi E.164 dan endpoint Operator, serta frontend production build yang berhasil. Audit UI lokal memakai fixture simulasi untuk dashboard, login, Operations, detail invoice/payment, target jaringan, histori interface, insiden, chart, dan polling WhatsApp; tidak ada error JavaScript, nomor relasi terbaca, dan input allowlist tidak ter-reset. Header mobile dan detail payment diperiksa pada 390 px tanpa horizontal overflow. ESLint belum dapat dijalankan karena plugin `@typescript-eslint` gagal memuat `ts-api-utils` (`Cannot read properties of undefined (reading 'Intrinsic')`). Build masih memperingatkan bundle ECharts 1.14 MB. Eksekusi runtime suite PostgreSQL/OpenLDAP belum dilakukan karena Docker daemon lokal tidak aktif dan `TEST_DATABASE_*` tidak tersedia. Uji SNMP agent/NAS nyata serta pairing WhatsApp sungguhan tetap perlu validasi operasional.

Catatan onboarding (2026-10-03): Dashboard checklist dan route User Guide/Quick Tour telah diimplementasikan. Verifikasi implementasi terakhir menjalankan `go build ./...`, `go test ./... -count=1`, `go vet ./...`, `web npm run type-check`, `web npm run build`, `git diff --check`, serta smoke test startup SQLite untuk seed otomatis; semua lulus. Build memperingatkan chunk ECharts 1.14 MB. CI sudah memiliki lint/test, PostgreSQL/OpenLDAP integration, dan build matrix Windows AMD64; status job untuk revisi saat ini harus diperiksa ketika perubahan didorong. Runtime PostgreSQL/OpenLDAP lokal, keseluruhan audit UI Operator/keyboard, backup-restore/upgrade, fake SNMP packet, serta pilot NAS/WhatsApp nyata masih tersisa.
