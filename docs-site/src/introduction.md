# MWX-ISP Handbook

Welcome to the **MWX-ISP Handbook**, the bilingual, version-controlled guide to
the MWX-ISP ISP management, billing, and RADIUS platform. The handbook lives in
[`docs-site/`](https://github.com/bjo163/mwx-isp/tree/main/docs-site) and is
built with [mdBook](https://rust-lang.github.io/mdBook/).

![MWX-ISP — ISP operations and RADIUS](./assets/mwx-isp-cover.svg)

Choose a language to begin:

- **English** — start with the [Overview](./en/overview.md).
- **中文** — 从[概述](./zh/overview.md)开始。

The paired chapters use matching names and link to their translations.

> **Published handbook.** GitHub Pages publishes this repository's handbook at
> <https://bjo163.github.io/mwx-isp/>. Older ToughRADIUS-branded domains and
> GitBook links may still exist outside this repository; they are legacy
> destinations and are not configured by this Pages workflow.

## Build locally

```bash
cargo install mdbook
mdbook build docs-site
mdbook serve docs-site
```

---

# MWX-ISP 使用手册

欢迎阅读 **MWX-ISP 使用手册**，这是 MWX-ISP ISP 管理、计费与 RADIUS 平台的双语版本化指南。手册位于仓库
[`docs-site/`](https://github.com/bjo163/mwx-isp/tree/main/docs-site)，并使用
[mdBook](https://rust-lang.github.io/mdBook/) 构建。

选择语言开始阅读：

- **English** — start with the [Overview](./en/overview.md).
- **中文** — 从[概述](./zh/overview.md)开始。

中英文对应章节使用相同文件名，并提供互相跳转的链接。

> **手册发布地址。** GitHub Pages 在
> <https://bjo163.github.io/mwx-isp/> 发布本仓库的手册。仓库之外仍可能存在旧
> ToughRADIUS 品牌域名或 GitBook 链接；它们属于旧地址，不由本 Pages 工作流配置。

## 本地构建

```bash
cargo install mdbook
mdbook build docs-site
mdbook serve docs-site
```
