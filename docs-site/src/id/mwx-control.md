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
- CLI owner Windows menemukan container Docker/Compose lewat SSH, membuka shell
  SSH interaktif dengan konfirmasi eksplisit, dan menyediakan start/stop/restart
  container terkonfirmasi serta updater VPS MWX-ISP yang memiliki rollback.
- Gossip tidak membawa data pelanggan, kredensial RADIUS, billing, atau
  konfigurasi. CLI tidak mentransfer file atau membaca environment container
  dan konfigurasi aplikasi.
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
`127.0.0.1:8080` pada host. Unduh `mwx-control_windows_amd64.exe` dari aset
GitHub Release MWX-ISP. CLI memiliki SSH bawaan dan memverifikasi host dengan
ketat; Windows OpenSSH tidak diperlukan. Public key owner harus diizinkan pada
VPS control dan setiap node, lalu fingerprint terverifikasi harus sudah ada di
`known_hosts`.

```powershell
$env:MWX_CONTROL_SSH_HOST = 'control.example.com'
$env:MWX_CONTROL_SSH_USER = 'root'
$env:MWX_CONTROL_SSH_KEY = "$HOME/.ssh/mwx-control-owner"
$env:MWX_CONTROL_KNOWN_HOSTS = "$HOME/.ssh/known_hosts"
$env:MWX_CONTROL_ADMIN_TOKEN = '<owner-token>'
./mwx-control_windows_amd64.exe nodes
./mwx-control_windows_amd64.exe services <node-id>
./mwx-control_windows_amd64.exe projects <node-id>
./mwx-control_windows_amd64.exe docker restart <node-id> <container-name>
./mwx-control_windows_amd64.exe update <node-id>
./mwx-control_windows_amd64.exe shell <node-id>
```

Aksi Docker, update, dan shell meminta frasa konfirmasi. Hak akses shell
mengikuti izin akun SSH. Perintah `update` mengharapkan instalasi MWX-ISP di
`/opt/mwx-isp`; gunakan `--ssh-port` jika port SSH bukan 22.
Metadata aksi ditambahkan ke `~/.mwx-control/audit.jsonl` di PC; file ini tidak
memuat token, private key, input shell, atau output remote. Ini adalah audit
lokal PC, bukan audit server yang tidak bisa diubah.

## Batas kepercayaan

Kunci gossip bersama mengenkripsi dan mengautentikasi trafik peer. Operator
server yang dapat membaca kunci tersebut dipercaya untuk bergabung dalam gossip.
Lindungi kunci dan batasi trafik dengan firewall. Versi ini belum mendukung
pencabutan node satu per satu; jika kunci terbuka, rotasi kunci di seluruh node.
Relay NAT dan hole punching belum tersedia; setiap peer perlu alamat dan port
yang dapat dijangkau.

Remote shell dan Docker memakai SSH langsung, bukan gossip. Setiap node perlu
endpoint SSH yang dapat dijangkau. Rilis ini belum membuat VPN atau merutekan
jaringan privat; WireGuard dan setup driver/izin admin Windows direncanakan
terpisah.
