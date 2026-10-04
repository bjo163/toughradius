# 手册发布说明

> English version: [Handbook Publishing](../en/gitbook-coexistence.md)

本手册维护于 `docs-site/src/`，并发布到仓库的 GitHub Pages 项目站点：
<https://bjo163.github.io/mwx-isp/>。发布工作流为
`.github/workflows/pages.yml`，负责构建 mdBook 源文件并部署结果，不会设置自定义域名。

仓库还包含 `.gitbook.yaml`，可供外部 GitBook 集成使用。仅凭此配置文件无法确认
GitBook 发布已连接或仍在运行。旧的 `toughradius.net` 地址属于此前品牌，可能由仓库外部
管理。目前的手册规范地址是上方 GitHub Pages 链接。

## 源文件与导航

mdBook 和已配置的 GitBook 集成均可读取同一组源文件：入口页为
`docs-site/src/introduction.md`，导航目录为 `docs-site/src/SUMMARY.md`。mdBook 配置位于
`docs-site/book.toml`，GitBook 配置位于 `.gitbook.yaml`。修改手册时，请同步维护英文和中文章节。

## 语言切换

mdBook 页面通过 `docs-site/assets/lang-toggle.{js,css}` 添加 EN / 中文切换按钮。它会链接到
`src/en/` 和 `src/zh/` 中同名的对应章节。GitBook 读者可使用侧栏语言目录和章节内链接切换。

## 构建与校验

运行 `mdbook build docs-site` 将静态站点构建到 `docs-site/book/`，或运行
`mdbook serve docs-site` 本地预览。`main` 分支上的 `docs-site/**` 发生变化时，GitHub Actions
会构建并发布手册。
