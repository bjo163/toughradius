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
- The Windows owner CLI discovers Docker containers and Compose projects over
  SSH, opens an explicitly confirmed interactive shell, and supports confirmed
  container start/stop/restart plus the existing rollback-aware MWX-ISP VPS
  updater.
- Gossip carries no subscriber, RADIUS credential, billing, or configuration
  data. The CLI does not transfer files or inspect container environments or
  application configuration.
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
binds to `127.0.0.1:8080` on the host. Download
`mwx-control_windows_amd64.exe` from the MWX-ISP GitHub release assets. It uses
a built-in SSH client and strict host-key checking; Windows OpenSSH is not
required. The owner SSH key must be authorized on the control host and every
VPS peer, and their verified fingerprints must already be present in
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

Docker actions, updates, and shell sessions require typing a confirmation
phrase. SSH permissions determine the shell's privileges. `update` expects the
MWX-ISP installation at `/opt/mwx-isp`; use `--ssh-port` if node SSH does not
use port 22.
Operation metadata is appended locally to `~/.mwx-control/audit.jsonl`; the
file excludes tokens, keys, shell input, and remote output. It is a local PC
audit file, not a tamper-proof server audit trail.

## Trust boundary

The shared gossip key authenticates and encrypts peer traffic. Every node
operator who can read that key is trusted to participate in gossip. Protect the
key and restrict peer traffic with firewall rules. There is no per-node revoke
in this first version: rotate the cluster key on every node if it is exposed.
NAT relay and hole punching are not included; peers need reachable advertised
addresses and ports.

Remote shell and Docker operations use direct SSH, not gossip. Nodes need
reachable SSH endpoints. This release does not create a VPN or route private
networks; WireGuard overlay support and the Windows driver/admin setup are
planned separately.
