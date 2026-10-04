# 快速开始

> English version: [Quick Start](../en/quickstart.md)

本指南使用 Docker Compose 和 PostgreSQL 在 Linux VPS 部署 MWX-ISP，并完成首次登录和
RADIUS 连通性检查。管理界面使用 TCP `1816`，RADIUS 认证使用 UDP `1812`，计费使用
UDP `1813`，RadSec 使用 TCP `2083`。

## 1. 在 VPS 安装

先在 Ubuntu 或 Debian VPS 安装 Docker Engine 与 Docker Compose 插件。如果需要 Caddy
自动申请 HTTPS 证书，请先将域名 DNS 指向服务器，然后运行：

```bash
git clone https://github.com/bjo163/mwx-isp.git
cd mwx-isp
sudo bash scripts/vps-install.sh
```

安装脚本会在 `/opt/mwx-isp/.env` 生成私密凭据、构建应用镜像，并启动 PostgreSQL、
MWX-ISP 和 Caddy。它只显示一次生成的管理员密码，请立即安全保存。管理 Web 端口默认
只绑定 localhost 并由 Caddy 代理；RADIUS 端口供 NAS 连接。检测到 systemd 时会启用
每日自动更新定时器。生产使用前请阅读
[`README.md`](https://github.com/bjo163/mwx-isp/blob/main/README.md) 和 VPS 部署说明。

将 `/opt/mwx-isp/.env` 中的 `MWX_ISP_DOMAIN` 设置为公网域名，Caddy 才能自动配置
HTTPS。默认 `localhost` 仅适合本地检查。不要将 PostgreSQL 暴露到公网。

## 2. 登录

打开 `https://<你的域名>/admin/`（安装期间也可使用本地代理地址），并使用：

- 用户名：`admin`
- 密码：VPS 安装脚本显示的一次性密码

登录后请修改密码。更新已有安装时会保留当前管理员密码。手动使用 Compose 时，将
`.env.vps.example` 复制为 `.env`，替换全部 `CHANGE_ME` 值，再运行
`docker compose up -d --build`。

## 3. 浏览示例数据

完全空白的新安装会在首次启动时自动加入标记清楚的合成示例数据；已有数据库不会被改动。
示例 NAS 与 RADIUS 用户默认禁用。请只在隔离的测试环境中创建或启用测试记录。

默认英文管理界面包含 **Customers**、**Packages**、**Subscriptions**、**Billing**、
**Network & Alerts** 和 **RADIUS** 等模块。客户、套餐、发票和付款编号由系统自动生成。

## 4. 本地验证 RADIUS

仓库内置了简易 RADIUS 客户端。在开发数据库中添加地址为 `127.0.0.1`、共享密钥为
`testing123` 的 NAS，再创建一个已启用的测试用户，然后运行：

```bash
go run ./cmd/radtest auth \
  -server 127.0.0.1 -secret testing123 \
  -username test1 -password 111111

go run ./cmd/radtest flow ...   # 依次执行认证、计费开始和计费结束
```

真实网络中，请使用 NAS 实际发送报文的源 IP 登记设备，并设置强共享密钥。仅在 VPS
防火墙开放必要的 RADIUS 流量。正式服务前，使用实际 NAS 验证认证、计费和 Disconnect。

## 5. 备份与更新

```bash
cd /opt/mwx-isp
sudo scripts/backup-db.sh
sudo scripts/vps-update.sh
```

备份默认写入本地；请另外复制到安全的异地存储。自动更新跟随 `main`，更新前创建数据库
备份，等待新应用健康检查；更新失败时会尝试回滚源码和镜像。请按自己的运维要求检查备份
脚本及保留策略。

## 后续阅读

- [管理界面手册](./admin-manual.md) —— 熟悉各管理页面。
- [运维指南](./ops-guide.md) —— 环境变量、证书、日志、备份和监控。
- [MikroTik 场景手册](./cookbook-mikrotik.md) —— 配置常见 ISP NAS。
- [常见问题](./faq.md) —— 排查安装与登录问题。
