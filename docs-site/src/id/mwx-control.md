# MWX-Control: jaringan peer privat

> English version: [MWX-Control](../en/mwx-control.md)

MWX-Control adalah service Go terpisah untuk menghubungkan instance MWX-ISP
milik developer. Node bertukar informasi keanggotaan dan status kesehatan
minimum secara langsung melalui gossip WAN terenkripsi. Node control menjadi
peer bootstrap, bukan database pusat; peer yang sudah terhubung tetap dapat
bertukar gossip saat node control tidak tersedia.

## Cakupan versi pertama

- Node control menyediakan inventaris node hanya-baca yang dilindungi token
  owner.
- Agent mengumumkan ID/nama node, versi MWX-ISP yang dikonfigurasi, status agent,
  dan status HTTP MWX-ISP opsional.
- Gossip tidak membawa data pelanggan, kredensial RADIUS, billing, atau
  konfigurasi. Tidak ada remote shell, eksekusi perintah, transfer file, update,
  atau perubahan konfigurasi jarak jauh.
- Status keanggotaan bersifat live dan tidak disimpan sebagai histori. Node
  yang hidup kembali bergabung lewat alamat bootstrap yang dikonfigurasi.

## Instalasi

Source dan Compose tersedia di
[`services/mwx-control/`](https://github.com/bjo163/mwx-isp/tree/main/services/mwx-control).
Di VPS Linux dengan Docker Compose, salin `.env.example` menjadi `.env`, lalu
isi ID node unik, alamat IPv4 publik, satu kunci gossip base64 32-byte yang sama
untuk seluruh peer, serta token API owner terpisah. Jalankan:

```bash
docker compose up -d --build
```

Gunakan `MWX_CONTROL_MODE=control` untuk node control developer. Di setiap host
MWX-ISP, gunakan `MWX_CONTROL_MODE=agent`, ID berbeda, dan
`MWX_CONTROL_PEERS=<ip-publik-yang-dikenal>:7946`. Isi
`MWX_CONTROL_HEALTH_URL` hanya jika agent dapat menjangkau endpoint kesehatan
MWX-ISP. Versi dan status kesehatan dikonfigurasi secara eksplisit; service
tidak membaca database bisnis.

Izinkan TCP dan UDP `7946` hanya dari alamat peer tepercaya. API owner terikat ke
`127.0.0.1:8080` pada host; gunakan SSH tunnel untuk membaca
`GET /api/v1/nodes`. Simpan token admin secara privat.

## Batas kepercayaan

Kunci gossip bersama mengenkripsi dan mengautentikasi trafik peer. Operator
server yang dapat membaca kunci tersebut dipercaya untuk bergabung dalam gossip.
Lindungi kunci dan batasi trafik dengan firewall. Versi ini belum mendukung
pencabutan node satu per satu; jika kunci terbuka, rotasi kunci di seluruh node.
Relay NAT dan hole punching belum tersedia; setiap peer perlu alamat dan port
yang dapat dijangkau.
