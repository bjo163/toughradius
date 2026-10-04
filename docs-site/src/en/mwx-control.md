# MWX-Control: private peer network

> Bahasa Indonesia: [Versi Indonesia](../id/mwx-control.md)

MWX-Control is a separate Go service for the MWX-ISP developer's own instance
fleet. Nodes exchange membership and small health announcements directly using
encrypted WAN gossip. The control node is a bootstrap peer; it is not a central
database or a prerequisite for existing peers to continue gossiping.

## First-version scope

- A control node exposes a read-only node inventory protected by a private
  owner token.
- Agent nodes announce a configured node ID/name, MWX-ISP version, agent
  liveness, and optional MWX-ISP HTTP health status.
- Gossip carries no subscriber, RADIUS credential, billing, or configuration
  data. No remote shell, command execution, file transfer, updates, or remote
  configuration are available.
- Membership is live state. Restarted peers rejoin through the configured
  bootstrap addresses; status history is not persisted.

## Deployment

The service is under [`services/mwx-control/`](https://github.com/bjo163/mwx-isp/tree/main/services/mwx-control).
On a Linux VPS with Docker Compose, copy `.env.example` to `.env`, set a unique
node ID, public advertised IPv4 address, one shared 32-byte base64 gossip key,
and a separate random owner API token, then run:

```bash
docker compose up -d --build
```

Set `MWX_CONTROL_MODE=control` for the developer control node. On each MWX-ISP
host, run the same service with `MWX_CONTROL_MODE=agent`, a unique node ID, and
`MWX_CONTROL_PEERS=<known-public-ip>:7946`. Configure the agent's optional
`MWX_CONTROL_HEALTH_URL` only when it can reach the MWX-ISP health endpoint.
Version and health are explicitly configured, not read from the business
database.

Allow TCP and UDP `7946` only between trusted peer addresses. The owner API
binds to `127.0.0.1:8080` on the host; use an SSH tunnel to query
`GET /api/v1/nodes`. Keep the admin token private.

## Trust boundary

The shared gossip key authenticates and encrypts peer traffic. Every node
operator who can read that key is trusted to participate in gossip. Protect the
key and restrict peer traffic with firewall rules. There is no per-node revoke
in this first version: rotate the cluster key on every node if it is exposed.
NAT relay and hole punching are not included; peers need reachable advertised
addresses and ports.
