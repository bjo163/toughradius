# MWX-ISP Handbook / Buku Panduan MWX-ISP

Welcome to the version-controlled handbook for MWX-ISP, an ISP management,
billing, and RADIUS platform.

Selamat datang di buku panduan MWX-ISP, platform untuk manajemen ISP, billing,
dan RADIUS. Pilih bahasa untuk mulai membaca:

- [English handbook](./en/overview.md)
- [Buku panduan Bahasa Indonesia](./id/overview.md)

The handbook source is maintained in
[`docs-site/`](https://github.com/bjo163/mwx-isp/tree/main/docs-site) and built
with [mdBook](https://rust-lang.github.io/mdBook/). GitHub Pages publishes it at
<https://bjo163.github.io/mwx-isp/>.

## Build locally

```bash
cargo install mdbook
mdbook build docs-site
mdbook serve docs-site
```
