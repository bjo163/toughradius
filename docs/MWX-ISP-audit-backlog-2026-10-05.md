# MWX-ISP — Audit mendalam dan backlog implementasi

Tanggal: 2026-10-05. Baseline kode lokal: `8de4dc5`, branch `main`.
Status: **perencanaan dan audit statis; belum merupakan hasil runtime, perbaikan, atau sertifikasi produksi**.
Bahasa dokumen: Indonesia; identifiers dan feature checklist tetap English.

Dokumen ini memecah 45 pekerjaan menjadi kartu yang dapat dikerjakan satu per satu oleh AI atau developer. [Todo utama](MWX-ISP-todo.md), [blueprint](MWX-ISP-blueprint.md), [roadmap](roadmap.md), dan [scope fitur](feature-checklist.md) tetap menjadi referensi produk. Checkbox implementasi di sini semuanya terbuka saat audit dibuat.

## 1. Insight utama

Risiko terbesar sekarang berada di sambungan antarfitur: halaman publik melewati konteks tenant yang digunakan admin; simulasi memanggil pencatatan pembayaran produksi; voucher menyimpan metadata komersial tanpa integrasi runtime yang terlihat; model operasional baru tidak ikut format backup aplikasi. Menambah menu sebelum menutup sambungan ini akan memperbesar pekerjaan dukungan.

Prioritaskan empat hal: kepercayaan pada uang yang tercatat, isolasi data tenant/pelanggan, kesesuaian label UI dengan efek backend, dan pemulihan data lengkap. RADIUS dan billing yang telah memiliki layanan bersama sebaiknya digunakan ulang, bukan dibuat versi kedua dalam handler custom.

Ada scope drift: portal, voucher, tiket, dan ODP sudah ada dalam kode tetapi sebagian masih dinyatakan non-goal. Keberadaan route tidak berarti fitur itu matang atau ekspansinya telah disetujui. Perbaikan containment pada surface existing dipetakan ke API/storage/security baseline; penambahan produk baru tetap memerlukan keputusan scope (A20).

### Koreksi dan batas bukti audit sebelumnya

- Query publik tanpa tenant context dapat membaca lintas tenant; create model tanpa TenantID memakai default 1. Ini lebih luas daripada sekadar pendaftaran salah tenant.
- Probe TCP sudah memperlakukan connection refused/reset sebagai reachable. Masalah A18 adalah label metode, timeout TCP yang bukan bukti ICMP, dan parsing IPv6; bukan semua port tertutup selalu dianggap down.
- Bentrok nomor batch sama jumlah pada hari sama (A05) dan FLAP dalam satu detik (A12) lebih mudah direproduksi daripada kasus 10.000 registrasi.
- Temuan backup A13 khusus format JSON aplikasi. Belum ada bukti bahwa backup PostgreSQL penuh kehilangan tabel itu.
- A06/A07 adalah celah integrasi statis yang perlu dibuktikan lewat jalur auth/accounting. Jangan mencatatnya sebagai hasil uji NAS nyata.
- Status milestone lama adalah histori delivery, bukan bukti bahwa semua tambahan kode sesudahnya sudah lolos validasi.

## 2. Cara menjalankan backlog

1. Pilih satu ID dari wave aktif; baca kartu, scope TR-F dan fungsi entry point. Pastikan HEAD dan working tree terbaru.
2. Buktikan trigger pada fixture terisolasi sebelum mengubah produk. Bila tidak terbukti, catat counter-evidence dan ubah klasifikasi; jangan membuat fix spekulatif.
3. Untuk P0, tutup aksi tidak sah di backend dahulu, kemudian UI. Menyembunyikan tombol saja tidak cukup.
4. Buat perubahan terkecil pada service yang sudah ada. Jangan melemahkan tenant callback, expiry checker, authorization, audit, atau billing validation supaya test lewat.
5. Tambahkan regression yang menguji perilaku gagal dan berhasil. Untuk transaksi/concurrency/tenant gunakan PostgreSQL; SQLite saja tidak cukup sebagai bukti produksi.
6. Perbarui UI/EN-ID/docs apabila kontrak atau perilaku berubah. Jangan menulis data produksi untuk reproduksi.
7. Laporkan file berubah, command pengujian aktual, hasil, migrasi/rollback, batas yang belum terbukti dan commit/PR jika tersedia.
8. Centang hanya setelah semua acceptance terpenuhi dan bukti tercatat. Pekerjaan docs tidak boleh mencentang implementasi.

Tidak perlu membuat 45 branch atau menjalankan semuanya sekaligus. Preferensi pengguna tetap hanya `dev` dan `main`; pekerjaan dokumen ini tidak membuat branch, commit, push, release, atau GitHub issue. GitHub issue dapat dibuat kemudian dengan judul ID yang sama bila diminta. Jangan mengubah nomor versi untuk backlog docs semata.

### Arti status dan prioritas

- **Terbukti dari kode:** perilaku/kelalaian langsung terlihat di fungsi terkait; reproduksi runtime tetap menjadi acceptance implementasi.
- **Celah integrasi:** jalur penghubung tidak ditemukan dalam pencarian terarah; telusuri sebelum menyimpulkan seluruh sistem tidak mendukungnya.
- **Perlu verifikasi:** hipotesis pengujian, bukan bug terkonfirmasi.
- **Penguatan:** hardening yang bermanfaat; cek existing coverage untuk menghindari duplikasi.
- **Usulan:** brainstorming, belum diotorisasi untuk implementasi produk baru.
- **P0:** mutasi uang/data publik atau isolasi sensitif; containment sebelum ekspos produksi.
- **P1:** fungsi inti, konsistensi data, recovery atau kegagalan alur operasional.
- **P2:** akurasi operasional, UX, ketahanan, dan efisiensi.
- **P3:** perluasan opsional setelah fondasi matang.

## 3. Urutan pengerjaan

| Wave | Pekerjaan | Gate keluar |
| --- | --- | --- |
| 0 — containment | A01–A04; H03 sesudah scope publik jelas | Tidak ada pelunasan anonim atau pembukaan data antar-tenant/pelanggan |
| 1 — fondasi data | A05, A08–A13, A16, H01–H02, A20 | Mutation atomik, nomor unik, role/tenant jelas, backup lengkap |
| 2 — operasi existing | A06–A07 sesudah keputusan scope, A14–A19, H04–H11 | Voucher/billing/ODP/monitoring memiliki perilaku nyata dan bukti regresi |
| 3 — pengalaman dan deployment | H12–H15 | UI konsisten, installer/recovery matrix dan fixture tersedia |
| 4 — pengembangan produk | Pilih maksimum 1–2 F-item sesudah evaluasi nilai | Keputusan scope, desain minimal dan acceptance disepakati |

Urutan antar-kartu mengikuti dependensi; rentang ID bukan instruksi menjalankan kartu yang masih blocked. Durasi tidak ditebak sebelum reproduksi dan inventory selesai. Ukuran praktis: satu kartu dapat dipecah menjadi backend, UI dan acceptance, namun harus ditutup sebagai satu alur pengguna.

## 4. Indeks checklist

| ID | Prioritas | Klasifikasi | Pekerjaan |
| --- | --- | --- | --- |
| A01 | P0 | Terbukti dari kode | [Hentikan pelunasan melalui simulate-pay](#a01) |
| A02 | P0 | Terbukti dari kode | [Tutup webhook pembayaran yang belum terverifikasi](#a02) |
| A03 | P0 | Terbukti dari kode | [Scope semua endpoint publik ke tenant terverifikasi](#a03) |
| A04 | P0 | Terbukti dari kode | [Batasi pembukaan data pelanggan dari lookup publik](#a04) |
| A05 | P1 | Terbukti dari kode | [Nomor batch voucher benar-benar unik](#a05) |
| A06 | P1 | Celah integrasi dari kode; perlu reproduksi auth | [Buktikan dan perbaiki kelayakan akun voucher RADIUS](#a06) |
| A07 | P1 | Celah integrasi dari pencarian kode | [Hubungkan masa berlaku dan kuota voucher ke runtime](#a07) |
| A08 | P1 | Terbukti dari kode | [Transaksi atomik batch, voucher dan kredensial](#a08) |
| A09 | P1 | Terbukti dari kode | [Penghapusan voucher tidak boleh sukses palsu](#a09) |
| A10 | P1 | Terbukti dari kode | [Registrasi pelanggan dan work order atomik](#a10) |
| A11 | P1 | Terbukti dari kode | [Tolak paket registrasi yang tidak tersedia](#a11) |
| A12 | P1 | Terbukti dari kode | [Satukan sequence tiket dan work order](#a12) |
| A13 | P1 | Terbukti dari kode | [Lengkapi cakupan backup JSON aplikasi](#a13) |
| A14 | P2 | Terbukti dari kode | [Edit ODP bisa mengosongkan nilai](#a14) |
| A15 | P2 | Terbukti dari kode | [Cetak seluruh voucher batch melalui pagination](#a15) |
| A16 | P1 | Terbukti dari kode | [Hubungkan pilihan paket pada generator voucher](#a16) |
| A17 | P2 | Terbukti dari kode | [Audit IP menghormati waktu yang diminta](#a17) |
| A18 | P2 | Terbukti dari kode | [Jelaskan jenis probe TCP dan dukung alamat IPv6](#a18) |
| A19 | P2 | Terbukti dari kode | [Jangan mempublikasikan paket fiktif ketika katalog kosong](#a19) |
| A20 | P1 | Terbukti dari dokumen dan route | [Selaraskan scope dokumen dengan fitur yang telah ada](#a20) |
| H01 | P1 | Perlu verifikasi | [Audit join, raw SQL dan relasi tenant](#h01) |
| H02 | P1 | Perlu verifikasi | [Matriks izin per aksi dan UI](#h02) |
| H03 | P1 | Penguatan | [Rate limit surface publik dan registrasi](#h03) |
| H04 | P1 | Perlu verifikasi | [Concurrency dan replay pembayaran](#h04) |
| H05 | P1 | Perlu verifikasi | [Suspend/reactivate dan kegagalan NAS](#h05) |
| H06 | P1 | Perlu verifikasi | [Buktikan disaster recovery dan migrasi](#h06) |
| H07 | P1 | Perlu verifikasi | [Integritas alokasi port ODP](#h07) |
| H08 | P2 | Perlu verifikasi | [Validasi pool IPAM dan kapasitas subnet](#h08) |
| H09 | P2 | Perlu verifikasi | [Kebenaran grafik trafik dan data stale](#h09) |
| H10 | P1 | Perlu verifikasi | [Scope ingestion syslog](#h10) |
| H11 | P2 | Perlu verifikasi | [WhatsApp tahan putus koneksi dan dedup](#h11) |
| H12 | P2 | Perlu verifikasi | [State UI, cache tenant dan pagination](#h12) |
| H13 | P2 | Penguatan | [EN/ID, aksesibilitas dan branding konsisten](#h13) |
| H14 | P1 | Perlu verifikasi | [Installer/update/release sebagai satu alur](#h14) |
| H15 | P2 | Penguatan | [Demo, data migration dan fixture sintetis](#h15) |
| F01 | P2 | Usulan; belum dijadwalkan | [Halaman kesiapan operasional](#f01) |
| F02 | P2 | Usulan; belum dijadwalkan | [Timeline aktivitas pelanggan](#f02) |
| F03 | P2 | Usulan; keputusan scope/provider diperlukan | [Integrasi satu payment gateway sungguhan](#f03) |
| F04 | P2 | Usulan; keputusan scope diperlukan | [Portal pelanggan minimum dengan login](#f04) |
| F05 | P3 | Usulan; keputusan scope diperlukan | [Work order teknisi minimum](#f05) |
| F06 | P3 | Usulan; belum dijadwalkan | [Maintenance window dan penekanan alert turunan](#f06) |
| F07 | P2 | Usulan; belum dijadwalkan | [Support bundle tersensor](#f07) |
| F08 | P2 | Usulan; belum dijadwalkan | [Import pelanggan dengan preview dan dry-run](#f08) |
| F09 | P2 | Usulan; belum dijadwalkan | [Status backup dan drill pemulihan](#f09) |
| F10 | P3 | Usulan; keputusan scope diperlukan | [API integrasi dengan token scoped](#f10) |

## 5. Kartu pekerjaan terperinci

Entry point di bawah adalah path relatif repository dan nama simbol untuk pencarian. Nomor baris sengaja tidak dibekukan karena akan berubah saat perbaikan.

<a id="a01"></a>

### A01 — Hentikan pelunasan melalui simulate-pay

- **Prioritas / status:** P0 / Terbukti dari kode.
- **Pemetaan scope:** TR-F028 / TR-F018.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp.go#simulateInvoicePayment`; `web/src/pages/CustomerPortalPage.tsx`; `internal/webserver/server.go#JwtSkipPrefix`.

**Masalah atau nilai:** Endpoint tanpa JWT mencatat pembayaran produksi dari aksi simulasi, tanpa bukti settlement.

**Implementasi yang diminta:** Nonaktifkan route mutasi simulasi di produksi dan hapus CTA pelunasan palsu; bila demo diperlukan, gunakan storage terisolasi dengan penanda demo eksplisit; pertahankan pembayaran manual admin.

**Kriteria selesai / skenario pembuktian:** Request anonim maupun operator biasa tidak mengubah invoice/payment/subscription; UI tidak menjanjikan pembayaran nyata; pembayaran manual yang sah tetap bekerja.

- [ ] A01.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A01.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A01.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A01.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a02"></a>

### A02 — Tutup webhook pembayaran yang belum terverifikasi

- **Prioritas / status:** P0 / Terbukti dari kode.
- **Pemetaan scope:** TR-F028 / TR-F018.
- **Dependensi:** A01.
- **Entry point:** `internal/adminapi/isp.go#handlePaymentWebhook`; `internal/webserver/server.go#JwtSkipPrefix`.

**Masalah atau nilai:** Status kosong diterima; amount <= 0 diubah menjadi saldo penuh; signature gateway tidak diperiksa di handler.

**Implementasi yang diminta:** Tutup endpoint sampai provider resmi dipilih; bila diaktifkan kelak, verifikasi raw-body signature, timestamp, replay, tenant merchant mapping dan amount persis; jangan menjadikan payload invalid sebagai pelunasan.

**Kriteria selesai / skenario pembuktian:** Unsigned/expired/replayed callback ditolak; amount nol/negatif/berlebih tidak mencatat uang; tidak ada response paid untuk pembayaran parsial; integrasi provider merupakan usulan F03.

- [ ] A02.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A02.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A02.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A02.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a03"></a>

### A03 — Scope semua endpoint publik ke tenant terverifikasi

- **Prioritas / status:** P0 / Terbukti dari kode.
- **Pemetaan scope:** TR-F033 / TR-F018.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/auth.go#tenantContextMiddleware`; `internal/adminapi/context.go#requestTenantDB`; `internal/tenancy/scope.go`; `internal/adminapi/isp.go`; `internal/adminapi/isp_operations.go#checkPublicVoucher`.

**Masalah atau nilai:** Tanpa JWT, middleware tidak menetapkan tenant; query model tidak mendapat filter. Bacaan publik dapat melintasi tenant dan create menggunakan default model tenant=1.

**Implementasi yang diminta:** Inventaris route public/portal; gunakan pemetaan host/path publik ke tenant aktif di server, atau tutup surface sampai pemetaan tersedia; jangan percaya tenant_id mentah; pastikan semua lookup/create memakai context itu.

**Kriteria selesai / skenario pembuktian:** Dua tenant dengan kode/telepon sama tidak saling terlihat; host/slug tidak dikenal dan tenant disabled ditolak; registrasi tersimpan di tenant yang benar.

- [ ] A03.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A03.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A03.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A03.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a04"></a>

### A04 — Batasi pembukaan data pelanggan dari lookup publik

- **Prioritas / status:** P0 / Terbukti dari kode.
- **Pemetaan scope:** TR-F033 / TR-F016.
- **Dependensi:** A03.
- **Entry point:** `internal/adminapi/isp.go#lookupCustomerPortal`; `internal/webserver/server.go#JwtSkipPrefix`.

**Masalah atau nilai:** Nomor pelanggan, telepon, atau identitas cukup untuk memperoleh nama, invoice dan outstanding; belum ada bukti kepemilikan di handler.

**Implementasi yang diminta:** Tutup lookup detail tanpa customer session atau token terbatas; bila portal dipertahankan, pakai verifikasi kepemilikan dan rate limit; kembalikan field minimum, bukan seluruh model invoice.

**Kriteria selesai / skenario pembuktian:** Mengetahui nomor telepon saja tidak membuka tagihan; percobaan berulang dibatasi; token pelanggan A tidak membuka B; respons tidak memudahkan enumerasi.

- [ ] A04.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A04.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A04.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A04.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a05"></a>

### A05 — Nomor batch voucher benar-benar unik

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F017.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#generateVouchers`; `internal/domain/isp_operations.go#HotspotBatch`.

**Masalah atau nilai:** BatchNo = tanggal + quantity, dengan unique index per tenant. Dua batch jumlah sama pada hari sama berbenturan secara deterministik.

**Implementasi yang diminta:** Ganti quantity suffix dengan sequence tenant yang atomik; alokasikan dalam transaksi batch; pertahankan nomor lama; jangan reset sequence saat restart.

**Kriteria selesai / skenario pembuktian:** Dua batch 20 voucher hari sama berhasil dengan nomor berbeda; concurrent create dan restart tidak menduplikasi nomor.

- [ ] A05.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A05.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A05.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A05.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a06"></a>

### A06 — Buktikan dan perbaiki kelayakan akun voucher RADIUS

- **Prioritas / status:** P1 / Celah integrasi dari kode; perlu reproduksi auth.
- **Pemetaan scope:** TR-F007 / TR-F012.
- **Dependensi:** A05, A08, A16.
- **Entry point:** `internal/adminapi/isp_operations.go#generateVouchers`; `internal/radiusd/plugins/auth/checkers/expire_checker.go`; `internal/domain/radius.go`.

**Masalah atau nilai:** Generator tidak mengisi ExpireTime dan bisa menyimpan ProfileId=0; expire checker menolak waktu sebelum sekarang. Voucher aktif di UI belum menjamin bisa login.

**Implementasi yang diminta:** Reproduksi satu voucher melalui auth pipeline; telusuri default profile/expiry dan checker aktif; wajibkan profil valid; definisikan kapan masa berlaku mulai; jangan melemahkan expiry checker global.

**Kriteria selesai / skenario pembuktian:** Voucher baru dengan paket sah dapat auth; voucher habis masa berlaku ditolak; profil hilang menghasilkan error sebelum ada data parsial.

- [ ] A06.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A06.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A06.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A06.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a07"></a>

### A07 — Hubungkan masa berlaku dan kuota voucher ke runtime

- **Prioritas / status:** P1 / Celah integrasi dari pencarian kode.
- **Pemetaan scope:** TR-F007 / TR-F008 / TR-F012.
- **Dependensi:** A06; keputusan scope A20.
- **Entry point:** `internal/domain/isp_operations.go#HotspotVoucher`; `internal/adminapi/isp_operations.go`; `internal/radiusd/radius_acct.go`.

**Masalah atau nilai:** Pencarian HotspotVoucher/FirstLoginAt/UsedBytes belum menemukan integrasi update pada jalur auth/accounting; field kuota/masa berlaku saat ini tampak sebagai metadata.

**Implementasi yang diminta:** Buktikan dengan Start/Interim/Stop; dokumentasikan unit byte, first-use expiry, retry accounting dan kebijakan sesi paralel; integrasikan ke policy existing atau sembunyikan klaim kuota sampai tersedia.

**Kriteria selesai / skenario pembuktian:** Pemakaian dan sisa kuota berubah dari accounting nyata; duplikat Interim tidak menggandakan pemakaian; expired/revoked/quota exhausted tidak mendapat akses baru.

- [ ] A07.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A07.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A07.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A07.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a08"></a>

### A08 — Transaksi atomik batch, voucher dan kredensial

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F017.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#generateVouchers`.

**Masalah atau nilai:** Batch dan voucher disimpan terpisah; error create RadiusUser diabaikan; response sukses bisa menghasilkan voucher tanpa akun.

**Implementasi yang diminta:** Validasi input/profile terlebih dahulu; simpan semua dalam satu transaction; propagasikan error; tangani bentrok kode dengan retry terbatas; gunakan actor asli untuk audit.

**Kriteria selesai / skenario pembuktian:** Fault insert akun atau kode collision tidak meninggalkan batch/voucher yatim; sukses hanya bila jumlah seluruh entitas sesuai quantity.

- [ ] A08.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A08.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A08.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A08.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a09"></a>

### A09 — Penghapusan voucher tidak boleh sukses palsu

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F017 / TR-F033.
- **Dependensi:** A08.
- **Entry point:** `internal/adminapi/isp_operations.go#deleteVoucherBatch`.

**Masalah atau nilai:** Error read/delete diabaikan dan delete antarentitas tidak atomik; penghapusan akun hanya berdasar username perlu pemeriksaan kepemilikan voucher.

**Implementasi yang diminta:** Cari batch dengan scope; transaksi delete dengan error checking; pertimbangkan foreign key akun yang dimiliki voucher; bedakan not-found dan database failure.

**Kriteria selesai / skenario pembuktian:** DB failure rollback seluruh penghapusan; tenant asing tidak terhapus; username collision tidak menghapus akun yang bukan milik voucher.

- [ ] A09.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A09.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A09.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A09.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a10"></a>

### A10 — Registrasi pelanggan dan work order atomik

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F027 / TR-F012 / TR-F017.
- **Dependensi:** A03, A12.
- **Entry point:** `internal/adminapi/isp.go#registerPublicCustomer`.

**Masalah atau nilai:** Update customer_no dan create tiket diabaikan error-nya; response sukses tetap memuat ticket_no yang bisa tidak tersimpan.

**Implementasi yang diminta:** Transaksikan customer, nomor final dan work order; gunakan service numbering bersama; tampilkan sukses sesudah commit; tambahkan idempotency untuk retry form.

**Kriteria selesai / skenario pembuktian:** Kegagalan insert tiket tidak meninggalkan registrasi setengah jadi; retry tidak membuat pelanggan/tiket ganda; response sesuai data tersimpan.

- [ ] A10.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A10.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A10.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A10.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a11"></a>

### A11 — Tolak paket registrasi yang tidak tersedia

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F027 / TR-F012.
- **Dependensi:** A03.
- **Entry point:** `internal/adminapi/isp.go#registerPublicCustomer`.

**Masalah atau nilai:** PackageID tidak ditemukan tetap dianggap sukses dengan nama Broadband Fiber; status aktif tidak diwajibkan pada lookup.

**Implementasi yang diminta:** Validasi paket aktif milik tenant dan relasi profile; batasi panjang field dan normalisasi telepon/email; tangani unique/dedup policy secara eksplisit.

**Kriteria selesai / skenario pembuktian:** Paket invalid/inactive/tenant asing ditolak 4xx tanpa customer/tiket baru; paket terpilih tersimpan sebagai relasi yang dapat dilacak.

- [ ] A11.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A11.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A11.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A11.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a12"></a>

### A12 — Satukan sequence tiket dan work order

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F017.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#createTroubleTicket/createFlappingTicket`; `internal/adminapi/isp.go#registerPublicCustomer`.

**Masalah atau nilai:** TCK menggunakan Nanosecond()%10000; FLAP menggunakan Unix()%10000; dua flapping ticket dalam detik sama memiliki nomor sama. WO menggunakan customer.ID%10000.

**Implementasi yang diminta:** Gunakan sequence tenant/jenis/periode yang atomik; jangan renumber dokumen lama; pisahkan idempotency kejadian flapping dari nomor dokumen.

**Kriteria selesai / skenario pembuktian:** Dua kejadian berbeda dalam satu detik mendapat nomor berbeda; event sama yang diulang tidak membuat tiket baru; concurrent create lulus.

- [ ] A12.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A12.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A12.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A12.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a13"></a>

### A13 — Lengkapi cakupan backup JSON aplikasi

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F017 / TR-F020.
- **Dependensi:** A20.
- **Entry point:** `internal/adminapi/system_backup.go#SystemBackup/tenantOwnedBackupRows`; `internal/domain/isp_operations.go`.

**Masalah atau nilai:** Ekspor aplikasi belum memuat HotspotBatch/Voucher, IPAMPool, TroubleTicket dan ODP. Ini temuan untuk backup JSON, bukan klaim pg_dump kehilangan tabel.

**Implementasi yang diminta:** Buat matriks model durable vs ephemeral; tambahkan format versi kompatibel, owner metadata, urutan restore dan validasi referensi untuk model durable; dokumentasikan beda backup JSON dan full DB.

**Kriteria selesai / skenario pembuktian:** Restore ke PostgreSQL kosong mengembalikan entitas dan relasi kedua tenant; backup lama tetap terbaca; coverage missing table gagal jelas.

- [ ] A13.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A13.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A13.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A13.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a14"></a>

### A14 — Edit ODP bisa mengosongkan nilai

- **Prioritas / status:** P2 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F013.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#updateODP`; `web/src/pages/ODPPage.tsx`.

**Masalah atau nilai:** Update hanya menerapkan string nonkosong dan angka nonnol; notes/alamat tidak bisa dihapus dan koordinat nol tidak bisa disimpan.

**Implementasi yang diminta:** Definisikan PUT lengkap atau PATCH dengan pointer field; bedakan absent, empty dan zero; selaraskan serializer form; validasi koordinat.

**Kriteria selesai / skenario pembuktian:** Clear notes/alamat bertahan setelah reload; latitude/longitude=0 dapat disimpan; field yang tidak dikirim tidak terhapus pada PATCH.

- [ ] A14.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A14.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A14.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A14.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a15"></a>

### A15 — Cetak seluruh voucher batch melalui pagination

- **Prioritas / status:** P2 / Terbukti dari kode.
- **Pemetaan scope:** TR-F013 / TR-F012.
- **Dependensi:** A08.
- **Entry point:** `web/src/pages/HotspotVouchersPage.tsx#vouchersQuery`; `internal/adminapi/isp_operations.go#listVouchers`.

**Masalah atau nilai:** UI mengambil perPage=100 dan mencetak array itu; generator menerima hingga 500 voucher. Batch besar tidak semuanya tercetak dari tampilan tersebut.

**Implementasi yang diminta:** Tambahkan paging list dan fetch seluruh halaman batch terpilih untuk print dengan batas 500; tampilkan count server vs loaded; hindari mencampur batch/filter tidak disengaja.

**Kriteria selesai / skenario pembuktian:** Batch 250 menghasilkan 250 kartu unik; list tetap paginated; gagal fetch halaman menghentikan print dan memberi retry.

- [ ] A15.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A15.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A15.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A15.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a16"></a>

### A16 — Hubungkan pilihan paket pada generator voucher

- **Prioritas / status:** P1 / Terbukti dari kode.
- **Pemetaan scope:** TR-F013 / TR-F007.
- **Dependensi:** A06.
- **Entry point:** `web/src/pages/HotspotVouchersPage.tsx#generateMutation`; `internal/adminapi/isp_operations.go#generateVoucherInput`.

**Masalah atau nilai:** Form/mutation yang diperiksa tidak mengirim package_id, sedangkan backend memakai paket untuk profileID; fallback menghasilkan 0.

**Implementasi yang diminta:** Tambahkan pilihan paket tenant aktif dengan ringkasan speed/validity; wajibkan profile yang benar di backend; empty-state arahkan membuat paket terlebih dahulu.

**Kriteria selesai / skenario pembuktian:** Payload memuat ID string valid; paket kosong/disabled tidak dapat submit; voucher menunjuk profile paket yang dipilih.

- [ ] A16.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A16.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A16.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A16.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a17"></a>

### A17 — Audit IP menghormati waktu yang diminta

- **Prioritas / status:** P2 / Terbukti dari kode.
- **Pemetaan scope:** TR-F012 / TR-F008.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#auditIPHistory`.

**Masalah atau nilai:** Lookup sesi live tidak difilter terhadap targetTime; waktu invalid diam-diam diganti now. Hasil bisa menggabungkan pemilik IP saat ini ke pencarian masa lalu.

**Implementasi yang diminta:** Tolak timestamp invalid; bandingkan interval sesi dengan waktu target; pisahkan current snapshot dari historical matches; gunakan timezone eksplisit dan propagasikan DB error.

**Kriteria selesai / skenario pembuktian:** IP berganti pelanggan menghasilkan pemilik sesuai interval; timestamp invalid 400; sesi hari ini tidak ditampilkan sebagai bukti kepemilikan kemarin.

- [ ] A17.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A17.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A17.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A17.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a18"></a>

### A18 — Jelaskan jenis probe TCP dan dukung alamat IPv6

- **Prioritas / status:** P2 / Terbukti dari kode.
- **Pemetaan scope:** TR-F031 / TR-F013.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#runLivePing`; `web/src/pages/IPAMPage.tsx`.

**Masalah atau nilai:** Implementasi TCP port 80 dilabel TCP/ICMP. IPv6 tanpa port melewati JoinHostPort karena mengandung ':', lalu Dial menerima alamat tanpa port.

**Implementasi yang diminta:** Gunakan parser IP/host:port yang benar; label hasil sebagai TCP reachability; tampilkan port dan metode; pisahkan ICMP jika benar-benar memakai probe ICMP existing; batasi target sesuai TR-F031.

**Kriteria selesai / skenario pembuktian:** IPv4/IPv6 input benar; refused/reset mengikuti kebijakan reachability yang terdokumentasi; timeout TCP tidak diklaim bukti ICMP down.

- [ ] A18.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A18.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A18.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A18.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a19"></a>

### A19 — Jangan mempublikasikan paket fiktif ketika katalog kosong

- **Prioritas / status:** P2 / Terbukti dari kode.
- **Pemetaan scope:** TR-F032 / TR-F013.
- **Dependensi:** A03, A11.
- **Entry point:** `internal/adminapi/isp.go#listPublicPackages`.

**Masalah atau nilai:** Tanpa paket aktif API membuat 4 paket hardcoded dengan harga, ID dan SLA; ini dapat ditampilkan seperti produk sungguhan.

**Implementasi yang diminta:** Kembalikan empty state untuk katalog produksi; contoh hanya melalui mode demo berlabel dan tidak dapat dipesan; sinkronkan loading/error/empty UI.

**Kriteria selesai / skenario pembuktian:** Tenant tanpa paket tidak menawarkan SLA/harga buatan; kegagalan query tidak menjadi demo; contoh tidak menghasilkan order produksi.

- [ ] A19.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A19.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A19.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A19.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="a20"></a>

### A20 — Selaraskan scope dokumen dengan fitur yang telah ada

- **Prioritas / status:** P1 / Terbukti dari dokumen dan route.
- **Pemetaan scope:** TR-F022 / TR-F023.
- **Dependensi:** —.
- **Entry point:** `docs/feature-checklist.md`; `docs/MWX-ISP-blueprint.md`; `internal/adminapi/isp.go`; `internal/adminapi/isp_operations.go`.

**Masalah atau nilai:** Dokumen non-goals masih mengecualikan portal/voucher/ticketing/ODP, sedangkan route dan UI sudah tersedia. AI dapat salah menganggap keberadaan kode sebagai approval ekspansi.

**Implementasi yang diminta:** Buat inventory keep/harden/hide/deprecate untuk surface existing; tetap izinkan containment defect; putuskan scope sebelum ekspansi; perbarui handbook EN/ID dan status capability setelah keputusan.

**Kriteria selesai / skenario pembuktian:** Setiap menu terpetakan ke scope/status; tidak ada klaim fitur belum teruji; AI dapat membedakan repair existing dengan usulan baru.

- [ ] A20.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] A20.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] A20.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] A20.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h01"></a>

### H01 — Audit join, raw SQL dan relasi tenant

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F033 / TR-F012.
- **Dependensi:** A03.
- **Entry point:** `internal/adminapi`; `internal/tenancy/scope.go`.

**Masalah atau nilai:** Callback hanya model-aware; join/subquery dapat membutuhkan filter eksplisit meskipun outer query scoped.

**Implementasi yang diminta:** Inventaris Table/Raw/Exec/Joins dan subquery; gunakan dua tenant dengan username/customer code sama; periksa foreign reference pada ticket, ODP, NAS dan profile.

**Kriteria selesai / skenario pembuktian:** Semua jalur diuji atau memiliki alasan exclusion; akses lintas tenant ditolak tanpa mengubah data.

- [ ] H01.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H01.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H01.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H01.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h02"></a>

### H02 — Matriks izin per aksi dan UI

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F016 / TR-F012 / TR-F013.
- **Dependensi:** A01, A02.
- **Entry point:** `internal/adminapi/authz.go`; `internal/adminapi/isp_operations.go`; `web/src/components/CustomMenu.tsx`.

**Masalah atau nilai:** Ticket create/update/dispatch tidak memakai requireAdmin; perlu putusan apakah operator memang boleh, bukan langsung dianggap bypass.

**Implementasi yang diminta:** Tuliskan izin platform_admin/admin/operator; cocokkan semua mutation route; hide/disable tombol sesuai API; jangan mengandalkan UI sebagai enforcement.

**Kriteria selesai / skenario pembuktian:** Fixture tiap role mendapat 2xx/403 sesuai matriks; operator tidak dapat mencatat pembayaran lewat route alternatif.

- [ ] H02.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H02.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H02.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H02.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h03"></a>

### H03 — Rate limit surface publik dan registrasi

- **Prioritas / status:** P1 / Penguatan.
- **Pemetaan scope:** TR-F018 / TR-F016.
- **Dependensi:** A03, A04.
- **Entry point:** `internal/webserver/server.go`; `internal/adminapi/auth.go`; `internal/adminapi/isp.go`.

**Masalah atau nilai:** Limiter terlihat di login; belum ditemukan limiter serupa pada register/lookup/voucher check.

**Implementasi yang diminta:** Tentukan limit per IP dan tenant, trusted-proxy policy, ukuran payload dan Retry-After; hindari membocorkan keberadaan pelanggan dari pesan error.

**Kriteria selesai / skenario pembuktian:** Burst menghasilkan 429; proxy header palsu tidak bypass; trafik tenant lain tetap dilayani.

- [ ] H03.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H03.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H03.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H03.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h04"></a>

### H04 — Concurrency dan replay pembayaran

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F028 / TR-F017.
- **Dependensi:** A02.
- **Entry point:** `internal/billing`; `internal/adminapi/isp.go`.

**Masalah atau nilai:** Transaksi saja belum membuktikan dua request bersamaan atau webhook parsial ulang aman.

**Implementasi yang diminta:** Periksa row lock, reference uniqueness per provider/tenant dan status parsial; siapkan concurrent payment dan duplicate event; tidak ubah aturan uang integer.

**Kriteria selesai / skenario pembuktian:** Saldo tidak negatif; satu event hanya dibukukan sekali; pembayaran parsial ulang tidak menggandakan pendapatan.

- [ ] H04.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H04.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H04.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H04.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h05"></a>

### H05 — Suspend/reactivate dan kegagalan NAS

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F028 / TR-F010.
- **Dependensi:** H04.
- **Entry point:** `internal/billing`; `internal/app/jobs.go`; `internal/adminapi/isp.go`.

**Masalah atau nilai:** Status billing, status user dan hasil Disconnect dapat berbeda ketika NAS timeout.

**Implementasi yang diminta:** Lacak manual vs billing suspension; cek beberapa invoice outstanding; simulasikan ACK/NAK/timeout dan retry; UI harus menampilkan action pending/failed.

**Kriteria selesai / skenario pembuktian:** Pembayaran tidak membatalkan suspend manual; debt tersisa sesuai kebijakan; retry tidak menduplikasi aksi atau audit.

- [ ] H05.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H05.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H05.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H05.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h06"></a>

### H06 — Buktikan disaster recovery dan migrasi

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F017 / TR-F020.
- **Dependensi:** A13.
- **Entry point:** `scripts/backup-db.sh`; `scripts/restore-db.sh`; `internal/adminapi/system_backup.go`; `internal/app`.

**Masalah atau nilai:** Backup dianggap berguna hanya setelah restore tervalidasi, termasuk secret enkripsi dan schema.

**Implementasi yang diminta:** Jalankan restore terisolasi dengan data synthetic dua tenant; periksa config/keys, recovery WAL bila tersedia, durasi dan versi; dokumentasikan rollback compatible vs forward-only.

**Kriteria selesai / skenario pembuktian:** Ada laporan restore, checksum, waktu pemulihan dan daftar data hilang yang diharapkan; tidak memakai DB produksi untuk eksperimen.

- [ ] H06.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H06.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H06.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H06.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h07"></a>

### H07 — Integritas alokasi port ODP

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F027 / TR-F017.
- **Dependensi:** H01, A20.
- **Entry point:** `internal/adminapi/isp.go#createCustomer/updateCustomer`; `internal/domain/isp.go`; `internal/adminapi/isp_operations.go`.

**Masalah atau nilai:** ODPID/ODPPort disalin dari input; belum ada bukti lengkap unique port, kapasitas dan foreign-owner enforcement.

**Implementasi yang diminta:** Uji port sama pada dua customer, port di luar kapasitas, pengurangan kapasitas, tenant lain dan clear assignment; pilih occupancy rule customer aktif vs semua.

**Kriteria selesai / skenario pembuktian:** Database dan API menjaga satu assignment sah per port; operasi bersamaan tidak overbook; port bebas sesuai definisi.

- [ ] H07.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H07.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H07.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H07.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h08"></a>

### H08 — Validasi pool IPAM dan kapasitas subnet

- **Prioritas / status:** P2 / Perlu verifikasi.
- **Pemetaan scope:** TR-F012 / TR-F017.
- **Dependensi:** —.
- **Entry point:** `internal/adminapi/isp_operations.go#calculateSubnetCapacity/createIPAMPool/updateIPAMPool`.

**Masalah atau nilai:** Kapasitas IPv6 dikembalikan sebagai angka representasi 65536; perlu bedakan estimasi dari capacity sebenarnya.

**Implementasi yang diminta:** Validasi CIDR canonical, overlap, versi, gateway, /31 /32 dan subnet IPv6 besar; representasikan kapasitas tanpa overflow dan tanpa angka palsu.

**Kriteria selesai / skenario pembuktian:** Invalid CIDR ditolak; capacity IPv6 berlabel/tepat; overlap policy konsisten; update tidak membuat pool salah versi.

- [ ] H08.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H08.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H08.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H08.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h09"></a>

### H09 — Kebenaran grafik trafik dan data stale

- **Prioritas / status:** P2 / Perlu verifikasi.
- **Pemetaan scope:** TR-F031 / TR-F015.
- **Dependensi:** H01.
- **Entry point:** `internal/adminapi/telemetry.go`; `internal/networkmonitor`; `web/src/pages/OperationsPage.tsx`.

**Masalah atau nilai:** Counter reset, wrap, interval kosong, arah in/out dan tenancy bisa membuat grafik menyesatkan.

**Implementasi yang diminta:** Gunakan fixture counter reset/wrap, reboot, hilang sampel dan interval berbeda; cek unit bits vs bytes dan arah NAS vs pelanggan; tampilkan last-updated.

**Kriteria selesai / skenario pembuktian:** Tidak ada spike palsu saat reset; missing tidak dianggap nol; label arah/unit dan scope benar.

- [ ] H09.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H09.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H09.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H09.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h10"></a>

### H10 — Scope ingestion syslog

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F031 / TR-F015.
- **Dependensi:** H01.
- **Entry point:** `internal/syslogd`; `internal/adminapi/telemetry.go`; `internal/domain`.

**Masalah atau nilai:** Ingestion background tidak otomatis memiliki JWT tenant context.

**Implementasi yang diminta:** Periksa binding, pemetaan sender ke NAS/tenant, unknown sender, payload size, retention dan flood limit; jangan percaya tenant dari message.

**Kriteria selesai / skenario pembuktian:** Sender unknown ditolak/dikarantina; log A tidak terbaca B; flood bounded; synthetic test tidak dicampur sebagai kejadian real.

- [ ] H10.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H10.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H10.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H10.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h11"></a>

### H11 — WhatsApp tahan putus koneksi dan dedup

- **Prioritas / status:** P2 / Perlu verifikasi.
- **Pemetaan scope:** TR-F030.
- **Dependensi:** H01, H02.
- **Entry point:** `internal/notify`; `internal/adminapi/notifications.go`; `internal/adminapi/isp_operations.go#dispatchTicketWhatsApp`.

**Masalah atau nilai:** Pengiriman langsung dan outbox perlu perilaku konsisten; real-account validation belum terbukti pada audit ini.

**Implementasi yang diminta:** Petakan direct-send vs outbox, opt-in recipient, reconnect, revoke, rate/backoff, dedup; uji provider fake sebelum akun uji yang diotorisasi.

**Kriteria selesai / skenario pembuktian:** Retry terbatas; failed/delivered terpisah; pesan tenant benar; tidak mengirim ulang event sama setelah restart.

- [ ] H11.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H11.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H11.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H11.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h12"></a>

### H12 — State UI, cache tenant dan pagination

- **Prioritas / status:** P2 / Perlu verifikasi.
- **Pemetaan scope:** TR-F013 / TR-F029.
- **Dependensi:** H01, H02.
- **Entry point:** `web/src/providers`; `web/src/pages`; `web/src/components`.

**Masalah atau nilai:** Custom pages memiliki pola query/cache tersendiri; audit belum membuktikan perilaku ganti tenant dan gagal API.

**Implementasi yang diminta:** Inventaris loading/error/empty/403/409; invalidate cache pada logout/tenant switch; cek pagination dan total server; gunakan komponen feedback bersama.

**Kriteria selesai / skenario pembuktian:** Login tenant B setelah A tidak menampilkan data cache A; retry bekerja; error tidak berubah menjadi daftar kosong palsu.

- [ ] H12.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H12.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H12.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H12.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h13"></a>

### H13 — EN/ID, aksesibilitas dan branding konsisten

- **Prioritas / status:** P2 / Penguatan.
- **Pemetaan scope:** TR-F013 / TR-F023 / TR-F029.
- **Dependensi:** H12.
- **Entry point:** `web/src/i18n`; `web/src/pages`; `web/src/components`; `docs-site/src`.

**Masalah atau nilai:** Masih ada string bahasa tunggal dan label enterprise yang tidak menyatakan status runtime.

**Implementasi yang diminta:** Inventory string; terjemahkan EN/ID; cek keyboard/focus/dialog/contrast; pakai brand tokens global; label demo, stale, pending dan failed secara eksplisit.

**Kriteria selesai / skenario pembuktian:** Pergantian bahasa mencakup custom pages; tanpa teks CJK di surface aplikasi; keyboard dapat menyelesaikan alur utama; warna status tetap jelas.

- [ ] H13.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H13.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H13.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H13.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h14"></a>

### H14 — Installer/update/release sebagai satu alur

- **Prioritas / status:** P1 / Perlu verifikasi.
- **Pemetaan scope:** TR-F020 / TR-F022.
- **Dependensi:** H06.
- **Entry point:** `scripts`; `Dockerfile`; `docker-compose.yml`; `.github/workflows`.

**Masalah atau nilai:** Riwayat installer telah diperbaiki; audit ini tidak membuktikan semua versi lama dan host bersih bekerja.

**Implementasi yang diminta:** Susun matrix fresh install/reinstall/deleted cwd/offline image/port conflict/update interrupted; periksa image digest, version app/frontend, backup, rollback dan exit codes.

**Kriteria selesai / skenario pembuktian:** Sukses hanya setelah ready; retry preserve secret/data; failure menunjukkan recovery tepat; binary/image/docs menunjuk versi konsisten.

- [ ] H14.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H14.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H14.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H14.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="h15"></a>

### H15 — Demo, data migration dan fixture sintetis

- **Prioritas / status:** P2 / Penguatan.
- **Pemetaan scope:** TR-F032 / TR-F022.
- **Dependensi:** —.
- **Entry point:** `internal/demoseed`; `test/integration`; `docs`.

**Masalah atau nilai:** Auto-seed harus aman pada tenant baru, database parsial dan instalasi existing.

**Implementasi yang diminta:** Buktikan seed hanya pada kondisi eligible; marker demo immutable; cleanup hanya record demo yang tidak dipakai produksi; sediakan fixture 2 tenant, 250 voucher dan invoice parsial.

**Kriteria selesai / skenario pembuktian:** Tidak reseed produksi; tidak menghapus relasi real; fixture cukup untuk reproduksi A01–A19 tanpa NAS nyata.

- [ ] H15.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] H15.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] H15.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] H15.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f01"></a>

### F01 — Halaman kesiapan operasional

- **Prioritas / status:** P2 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F013 / TR-F015.
- **Dependensi:** A01–A04, H06.
- **Entry point:** `web/src/pages/OperationsPage.tsx`; `internal/adminapi`.

**Masalah atau nilai:** Operator memerlukan penjelasan konfigurasi mana yang menghalangi pemakaian.

**Implementasi yang diminta:** MVP tampilkan PostgreSQL/schema, scheduler heartbeat, NAS terdaftar, outbox, backup terakhir beserta stale/unknown dan tindakan next-step; gunakan data existing.

**Kriteria selesai / skenario pembuktian:** Tanpa secret atau skor sehat fiktif; health unknown dinyatakan unknown; dapat mengarahkan user memperbaiki 3 masalah umum.

- [ ] F01.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F01.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F01.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F01.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f02"></a>

### F02 — Timeline aktivitas pelanggan

- **Prioritas / status:** P2 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F013 / TR-F028.
- **Dependensi:** H05, H12.
- **Entry point:** `web/src/resources/isp.tsx`; `internal/billing`; `internal/domain`.

**Masalah atau nilai:** Operator sulit menghubungkan invoice, payment dan alasan putus koneksi.

**Implementasi yang diminta:** Gabungkan event existing tenant-scoped, filter tanggal dan link dokumen; jelaskan reason suspend dan status action NAS; hindari duplikasi penyimpanan event.

**Kriteria selesai / skenario pembuktian:** Urutan waktu stabil, paginated, role-safe; satu insiden dapat ditelusuri dari invoice ke reactivate.

- [ ] F02.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F02.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F02.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F02.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f03"></a>

### F03 — Integrasi satu payment gateway sungguhan

- **Prioritas / status:** P2 / Usulan; keputusan scope/provider diperlukan.
- **Pemetaan scope:** Usulan perlu ID baru; terkait TR-F028; dibatasi TR-N001.
- **Dependensi:** A01–A04, H04; keputusan bisnis.
- **Entry point:** `internal/adminapi/isp.go`; `internal/billing`; `web/src/pages/CustomerPortalPage.tsx`.

**Masalah atau nilai:** Portal pembayaran membutuhkan settlement terverifikasi, bukan virtual account/QR buatan.

**Implementasi yang diminta:** Pilih satu provider, model merchant tenant, fee/refund/reconciliation dan sandbox; desain signed webhook, idempotency dan token invoice; verifikasi dokumentasi resmi provider saat implementasi.

**Kriteria selesai / skenario pembuktian:** Sandbox sampai settlement lengkap lulus; invalid signature/replay tidak mencatat uang; real merchant belum aktif sampai konfigurasi disahkan.

- [ ] F03.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F03.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F03.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F03.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f04"></a>

### F04 — Portal pelanggan minimum dengan login

- **Prioritas / status:** P2 / Usulan; keputusan scope diperlukan.
- **Pemetaan scope:** Usulan perlu ID baru; terkait TR-F027/TR-F033; dibatasi TR-N002.
- **Dependensi:** A03, A04, H03.
- **Entry point:** `web/src/pages/CustomerPortalPage.tsx`; `internal/adminapi`.

**Masalah atau nilai:** Self-service perlu bukti kepemilikan pelanggan dan scope organisasi.

**Implementasi yang diminta:** MVP sesi pelanggan terpisah dari operator, lihat tagihan dan status layanan; tentukan OTP/link expiry, recovery dan biaya provider; hindari edit konfigurasi NAS.

**Kriteria selesai / skenario pembuktian:** Customer hanya melihat dirinya; revoke/logout bekerja; enumerasi dan token guessing dibatasi.

- [ ] F04.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F04.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F04.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F04.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f05"></a>

### F05 — Work order teknisi minimum

- **Prioritas / status:** P3 / Usulan; keputusan scope diperlukan.
- **Pemetaan scope:** Usulan perlu ID baru; terkait TR-F027; dibatasi TR-N002.
- **Dependensi:** A10, A12, H02, A20.
- **Entry point:** `web/src/pages/TroubleTicketsPage.tsx`; `internal/adminapi/isp_operations.go`.

**Masalah atau nilai:** Tiket pemasangan butuh status dan tanggung jawab yang konsisten.

**Implementasi yang diminta:** Tentukan open/assigned/in_progress/resolved/closed/reopened, assignment, catatan wajib dan SLA sederhana; lampiran nanti setelah storage/retention dipilih.

**Kriteria selesai / skenario pembuktian:** Transisi invalid ditolak; reopened membersihkan resolved_at sesuai aturan; histori actor/time tersimpan.

- [ ] F05.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F05.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F05.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F05.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f06"></a>

### F06 — Maintenance window dan penekanan alert turunan

- **Prioritas / status:** P3 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F031 / TR-F030.
- **Dependensi:** H09, H11.
- **Entry point:** `internal/networkmonitor`; `internal/notify`; `web/src/pages/OperationsPage.tsx`.

**Masalah atau nilai:** Maintenance dan satu upstream down bisa mengirim banyak notifikasi turunan.

**Implementasi yang diminta:** MVP window per target dengan timezone, alasan, expiry otomatis; dependency manual hanya target registered; tetap rekam insiden meski notification muted.

**Kriteria selesai / skenario pembuktian:** Window berakhir otomatis; kejadian tetap terlihat; dedup/recovery alert tidak hilang; tidak menambah network scanning.

- [ ] F06.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F06.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F06.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F06.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f07"></a>

### F07 — Support bundle tersensor

- **Prioritas / status:** P2 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F019 / TR-F020.
- **Dependensi:** H02, H14.
- **Entry point:** `cmd`; `internal/adminapi`; `scripts`.

**Masalah atau nilai:** Diagnosis VPS memerlukan versi/log/config tanpa menyalin secret.

**Implementasi yang diminta:** MVP export manifest versi, status layanan, log bounded dan config allowlist; sensor credential, nomor identitas dan data pelanggan; local download dengan expiry.

**Kriteria selesai / skenario pembuktian:** Secret canary tidak muncul dalam arsip; ukuran dibatasi; export dicatat dan terbatas platform admin.

- [ ] F07.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F07.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F07.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F07.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f08"></a>

### F08 — Import pelanggan dengan preview dan dry-run

- **Prioritas / status:** P2 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F019 / TR-F027 / TR-F013.
- **Dependensi:** H01, H15.
- **Entry point:** `cmd`; `internal/adminapi`; `web/src/resources/isp.tsx`.

**Masalah atau nilai:** Migrasi dari spreadsheet butuh validasi sebelum ribuan record masuk.

**Implementasi yang diminta:** Gunakan mapping kolom, validasi tenant/paket, dedup nomor, laporan row error dan resumable batch; dry-run tidak menulis DB.

**Kriteria selesai / skenario pembuktian:** File invalid memberi laporan per baris; duplicate tidak membuat double subscription; tidak mengubah pelanggan existing tanpa pilihan eksplisit.

- [ ] F08.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F08.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F08.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F08.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f09"></a>

### F09 — Status backup dan drill pemulihan

- **Prioritas / status:** P2 / Usulan; belum dijadwalkan.
- **Pemetaan scope:** TR-F020 / TR-F013.
- **Dependensi:** A13, H06.
- **Entry point:** `scripts/backup-db.sh`; `scripts/restore-db.sh`; `web/src/pages/OperationsPage.tsx`.

**Masalah atau nilai:** File backup ada belum membuktikan bisa digunakan.

**Implementasi yang diminta:** Tampilkan last success, ukuran/checksum, versi, umur dan hasil restore drill terisolasi; link runbook; hindari tombol restore destructive tanpa review target.

**Kriteria selesai / skenario pembuktian:** Backup stale terlihat; drill memakai volume terpisah; hasil dapat dibaca operator tanpa akses secret.

- [ ] F09.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F09.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F09.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F09.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

<a id="f10"></a>

### F10 — API integrasi dengan token scoped

- **Prioritas / status:** P3 / Usulan; keputusan scope diperlukan.
- **Pemetaan scope:** Usulan perlu ID baru; terkait TR-F033.
- **Dependensi:** H01–H03.
- **Entry point:** `internal/adminapi/auth.go`; `internal/adminapi/authz.go`.

**Masalah atau nilai:** Integrasi eksternal sebaiknya tidak menyimpan password admin atau JWT manusia.

**Implementasi yang diminta:** MVP token tenant dengan permission allowlist, expiry, hash-at-rest, revoke, rate limits dan audit; pilih satu use case read-only dahulu.

**Kriteria selesai / skenario pembuktian:** Token A tidak mengakses B; revoke langsung efektif; raw token tampil sekali; role operator tidak dapat mint token lebih kuat.

- [ ] F10.1 Reproduksi/inventory dan bukti dicatat; scope/dependensi dipenuhi.
- [ ] F10.2 Perubahan minimal backend/UI/data yang diperlukan selesai.
- [ ] F10.3 Acceptance di atas dan skenario tenant/role relevan lulus.
- [ ] F10.4 Docs, migrasi/rollback bila perlu, dan bukti delivery diperbarui.

## 6. Fixture minimum dan matriks penerimaan

Gunakan data sintetis, Docker/PostgreSQL terisolasi, fake NAS untuk protokol, dan notification provider fake. NAS fisik/akun WhatsApp nyata menjadi pilot terpisah yang diotorisasi.

| Fixture / aksi | Bukti yang wajib diamati |
| --- | --- |
| Tenant A/B dengan kode customer, invoice, voucher dan username sama | Scope tidak memilih row pertama milik tenant lain |
| Platform admin, tenant admin, operator, anonymous, customer token | Status HTTP sesuai matriks, tidak ada side effect pada penolakan |
| Invoice unpaid/partial/paid/void; nominal nol/negatif/melebihi saldo | Tidak ada paid palsu, saldo negatif atau settlement duplicate |
| 2 pembayaran paralel dan callback duplicate/out-of-order | Exactly-once effect pada pencatatan uang; audit dapat ditelusuri |
| Dua batch quantity=20 tanggal sama dan batch 250 voucher | Nomor unik, akun sah, cetak 250 kode berbeda |
| Inject kegagalan insert/delete di langkah kedua transaksi | Semua perubahan rollback; response tidak mengklaim sukses |
| Accounting Start/Interim/Stop duplicate dan out-of-order | Kuota/traffic tidak dihitung ganda; expiry konsisten |
| NAS ACK/NAK/timeout saat suspend dan sesudah payment | Reason suspend terjaga; status runtime vs requested dijelaskan |
| Restore JSON lama/baru dan full DB ke target kosong | Row ownership, referensi, secret-dependent config dan sequence pulih |
| ODP penuh, dua assign port bersamaan, clear field/koordinat nol | Tidak ada overbooking; clear dan zero bertahan setelah reload |
| IPv4/IPv6, TCP refused/reset/timeout, counter reset dan missing samples | Tidak ada diagnosis atau grafik palsu |
| Logout A/login B, error jaringan, 403/409, bahasa EN/ID | Cache tidak bocor, error terjelaskan, retry aman |

Pengujian uang/otorisasi tidak memanggil payment gateway nyata atau mengirim WhatsApp pelanggan. Jangan menganggap test mock sebagai verifikasi perangkat fisik.

## 7. Keputusan produk untuk brainstorming

| Keputusan | Default rencana | Dibutuhkan sebelum |
| --- | --- | --- |
| Portal publik existing dipertahankan atau disembunyikan sementara? | Tutup mutasi/data sensitif sampai A01–A04 beres | F03/F04 |
| Voucher adalah kapabilitas inti atau eksperimen? | Hardening containment existing; jangan janji kuota sampai A06/A07 terbukti | Ekspansi voucher |
| Payment provider dan tenant merchant model | Belum dipilih; pembayaran manual tetap baseline | F03 |
| Scope tiket, ODP dan IPAM | Inventory existing, tetapkan keep/harden/hide per surface | A20 dan F05 |
| Durasi retention log/accounting/backup | Tentukan berdasarkan kebutuhan operator dan kapasitas; belum mengklaim aturan hukum tertentu | H06/H09/H10 |
| Target kapasitas pelanggan/NAS/accounting EPS | Ukur workload dahulu, lalu tetapkan budget latency/resource | Load/performance follow-up |
| Branding | Global sesuai TR-F029; identitas invoice per tenant terpisah | Jangan menambah theme per tenant diam-diam |
| Control plane/P2P/remote shell | Tidak dijadwalkan: pengguna sebelumnya membatalkannya | Hanya bila diminta kembali secara eksplisit |

## 8. Prompt eksekusi yang bisa disalin ke AI lain

```text
Kerjakan satu kartu <ID> di docs/MWX-ISP-audit-backlog-2026-10-05.md.
Baca docs/feature-checklist.md, dokumen repo yang berlaku, dependensi kartu,
dan fungsi entry point. Pertahankan perubahan lokal milik pekerjaan lain.
Reproduksi dengan fixture sintetis terisolasi; jangan memakai data produksi.
Jika bukti membantah temuan, catat bukti dan koreksi kartu sebelum implementasi.
Implementasikan perbaikan minimal menggunakan service existing.
Verifikasi happy path, invalid input, failure rollback, role dan dua tenant.
Gunakan PostgreSQL untuk bukti locking, unique constraint dan transaksi.
Perbarui docs/UI EN-ID yang terpengaruh; jangan membuat fitur di luar kartu.
Jangan centang selesai sebelum acceptance dan bukti aktual lengkap.
Laporkan perubahan, pengujian, migrasi/rollback, risiko tersisa dan next ID.
Usulan F-item memerlukan keputusan scope sebelum dibangun.
Ikuti preferensi branch pengguna (dev/main) dan otorisasi publikasi sesi.
```

### Format catatan hasil per kartu

```text
ID:
Baseline/commit:
Bukti awal dan trigger:
Keputusan scope:
File dan perilaku berubah:
Command verifikasi + hasil aktual:
Hasil tenant/role/failure:
Migrasi dan rollback:
Batas pilot eksternal:
Commit/PR/release (bila dibuat):
Status: planned / reproduced / implementing / verified / delivered / disproved
Next dependency yang terbuka:
```

## 9. Definition of done per wave

- [ ] Wave 0: seluruh P0 ditutup di backend dan public UI; regression anonim/dua tenant lulus.
- [ ] Wave 1: integritas transaksi/nomor, matriks scope/role, recovery durable data lengkap.
- [ ] Wave 2: runtime voucher dan diagnostik mencerminkan perilaku nyata; pilot eksternal diberi status tersendiri.
- [ ] Wave 3: UX error/loading, EN/ID, deployment dan recovery memiliki bukti terukur.
- [ ] Wave 4: hanya proposal terpilih dengan scope yang disetujui dijadwalkan; proposal lain tetap unchecked.

Tidak ada checkbox di bagian implementasi yang diselesaikan oleh penulisan dokumen audit ini.

