# Gambaran Umum

> English version: [Overview](../en/overview.md)

MWX-ISP adalah platform open source untuk operasional ISP, ditulis dengan Go.
Platform ini menggabungkan alur pelanggan dan billing dengan layanan RADIUS,
administrasi berbasis tenant, pemantauan jaringan, serta konsol React.
PostgreSQL menjadi database default untuk produksi; SQLite tersedia untuk
pengembangan lokal.

## Kemampuan utama

- **RADIUS** untuk autentikasi, accounting, pengelolaan NAS, sesi online, dan
  riwayat audit.
- **RadSec** untuk transport RADIUS melalui TLS.
- **CoA dan Disconnect** untuk otorisasi dinamis.
- **EAP / 802.1X**, termasuk EAP-MD5, EAP-MSCHAPv2, EAP-TLS, PEAP, dan EAP-TTLS.
  TLS 1.3 didukung untuk EAP bertunnel. Metode MS-CHAPv2 berorientasi pada
  kompatibilitas dan memiliki risiko keamanan; gunakan EAP-TLS jika sertifikat
  klien dapat dikelola. TEAP dan EAP-PWD masih ada dalam roadmap.
- **Operasional dan billing ISP** untuk pelanggan, paket, subscription, invoice,
  pembayaran, nomor dokumen otomatis, serta suspend/reactivate berbasis billing.
- **Administrasi multi-tenant** untuk organisasi ISP dan RT/RW Net. Baca
  [Panduan Operasional](./ops-guide.md) untuk tata kelola tenant.
- **Visibilitas operasional** melalui dashboard, monitoring jaringan, alert,
  dan integrasi WhatsApp opsional.
- **Dukungan multi-vendor** melalui atribut khusus perangkat Cisco, MikroTik,
  Huawei, dan vendor lain.

## Layanan dan port

| Layanan | Protokol | Fungsi |
| --- | --- | --- |
| Web / Admin API | HTTP, TCP `1816` | Konsol manajemen dan REST API |
| RADIUS Auth | UDP `1812` | Autentikasi |
| RADIUS Accounting | UDP `1813` | Pencatatan sesi |
| RadSec | TLS, TCP `2083` | RADIUS terenkripsi |

## Mulai dari sini

- [Mulai Cepat](./quickstart.md) — instalasi VPS, login, data contoh, dan uji
  awal RADIUS.
- [Konsep & Terminologi](./concepts.md) — istilah AAA dan konsep produk.
- [Panduan Integrasi Vendor](./vendor-guide.md) — konfigurasi MikroTik,
  Huawei, Cisco, dan perangkat lain.
- [Panduan Admin](./admin-manual.md) — alur kerja konsol manajemen.
- [Panduan Operasional](./ops-guide.md) — konfigurasi, tenant, monitoring,
  backup, restore, dan update.
- [FAQ](./faq.md) — jawaban untuk pertanyaan umum.
- [Peta Dokumentasi](./documentation-map.md) — roadmap, keamanan, cakupan fitur,
  dan referensi teknis.
- [MWX-Control](./mwx-control.md) — service peer privat milik developer untuk
  melihat status instance MWX-ISP.
