# FAQ

> English version: [FAQ](../en/faq.md)

## Bagaimana cara login pertama kali?

Instalasi VPS mencetak password acak untuk `admin` satu kali. Simpan saat
installer berjalan lalu segera ganti setelah login. Instalasi lokal baru dapat
memakai `admin` / `admin`; jangan gunakan kredensial tersebut pada server yang
terbuka ke jaringan.

## Mengapa beberapa daftar sudah berisi data contoh?

Sample otomatis dibuat hanya jika database benar-benar kosong. Contoh diberi
penanda; NAS dan akun RADIUS tidak aktif. Data operasional yang sudah ada tidak
akan ditimpa atau di-seed ulang.

## Apakah semua nomor harus diisi manual?

Tidak. Nomor customer, subscription, invoice, dan payment dibuat otomatis.
Operator tidak perlu mengarang nomor urut.

## Apa yang harus dicek jika autentikasi RADIUS gagal?

Periksa alamat sumber NAS, shared secret, status NAS dan user, profil RADIUS,
firewall UDP `1812`, serta log autentikasi. Accounting menggunakan UDP `1813`.
Lakukan uji dengan perangkat dan konfigurasi vendor yang benar-benar dipakai.

## Apakah update menghapus password admin saat ini?

Tidak. Password pada instalasi existing dipertahankan. Password installer hanya
dibuat saat menyiapkan instalasi baru.

## Di mana dokumentasi konfigurasi lengkap?

Lihat [Panduan Operasional](./ops-guide.md) atau
[FAQ lengkap berbahasa English](../en/faq.md).
