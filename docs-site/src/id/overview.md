# Gambaran Umum

> English version: [Overview](../en/overview.md)

MWX-ISP adalah platform open source untuk manajemen ISP, billing, dan RADIUS.
Backend Go menjalankan autentikasi dan accounting jaringan, sedangkan konsol
React Admin digunakan operator untuk mengelola layanan dan operasional.

## Kemampuan utama

- **RADIUS** untuk autentikasi dan accounting pelanggan.
- **RadSec** untuk transport RADIUS melalui TLS.
- **CoA dan Disconnect** untuk otorisasi dinamis.
- **EAP / 802.1X**, termasuk EAP-TLS, PEAP, dan EAP-TTLS. Metode berbasis
  MS-CHAPv2 memiliki risiko keamanan; gunakan EAP-TLS jika sertifikat klien
  dapat dikelola.
- **Manajemen ISP dan billing** untuk customer, paket, subscription, invoice,
  pembayaran, dan siklus suspend / reactivate.
- **PostgreSQL sebagai database default**. SQLite tetap tersedia untuk
  pengembangan lokal.

## Layanan dan port

| Layanan | Protokol | Fungsi |
| --- | --- | --- |
| Web / Admin API | TCP `1816` | Konsol manajemen dan REST API |
| RADIUS Auth | UDP `1812` | Autentikasi |
| RADIUS Accounting | UDP `1813` | Pencatatan sesi |
| RadSec | TCP `2083` | RADIUS terenkripsi melalui TLS |

## Mulai dari sini

- [Mulai Cepat](./quickstart.md) — instalasi VPS, login, data contoh, dan uji RADIUS.
- [Panduan Admin](./admin-manual.md) — alur kerja konsol.
- [Panduan Operasional](./ops-guide.md) — konfigurasi, backup, dan update.
- [FAQ](./faq.md) — pemecahan masalah umum.
- [Peta Dokumentasi](./documentation-map.md) — semua bab dan referensi proyek.

Panduan teknis vendor dan protokol yang belum diterjemahkan tersedia dalam
[versi English](../en/overview.md#where-to-go-next).
