# MWX-Control

MWX-Control is a private, developer-operated peer network for MWX-ISP
installations. One node exposes an owner-only, read-only inventory API; every
node participates directly in encrypted WAN gossip. The control node is a
bootstrap peer, not a central database: the peer mesh can continue exchanging
membership while that node is unavailable.

The first version shares only node ID/name, configured MWX-ISP version, agent
and optional instance-health state, and health-check time. It does not transfer
subscriber, RADIUS credential, billing, or configuration data. It has no shell,
command execution, file transfer, remote update, or remote configuration API.

## Run the developer control node

On a Linux host with Docker Compose, copy `.env.example` to `.env`, then set:

- A unique `MWX_CONTROL_NODE_ID` and readable node name.
- `MWX_CONTROL_ADVERTISE_ADDR` to this host's public IPv4 address. Set the
  advertised port if it is not `7946`.
- `MWX_CONTROL_GOSSIP_KEY` to one random 32-byte key shared with the approved
  agent installations: `openssl rand -base64 32`.
- `MWX_CONTROL_ADMIN_TOKEN` to a separate random owner API token:
  `openssl rand -hex 32`.

Restrict the file after editing: `chmod 600 .env`.

Start the control service:

```bash
docker compose up -d --build
```

The owner API is bound to host loopback on port `8080`. Reach it remotely with
an SSH tunnel and query the read-only inventory:

```bash
ssh -L 8080:127.0.0.1:8080 <ssh-user>@<control-server>
curl -H "Authorization: Bearer <MWX_CONTROL_ADMIN_TOKEN>" \
  http://127.0.0.1:8080/api/v1/nodes
```

The unauthenticated `/healthz` endpoint contains only service health. The node
inventory requires the owner token.

## Add an MWX-ISP node

Deploy the same service image or source beside an MWX-ISP instance. Set
`MWX_CONTROL_MODE=agent`, a unique node ID/name, the same gossip key, and
`MWX_CONTROL_PEERS` to one or more known members (`<public-ip>:7946`). Set
`MWX_CONTROL_ADVERTISE_ADDR` to this node's public IPv4 and
`MWX_CONTROL_HEALTH_URL` to an HTTP(S) health URL reachable from the agent, if
the MWX-ISP instance has one. The agent reports `unknown` when no application
health URL is configured. Version is explicitly supplied in
`MWX_CONTROL_MWX_ISP_VERSION`.

Open TCP and UDP `7946` only between trusted peer addresses. Both transports are
used by the WAN gossip protocol. If a host uses a different external port, set
`MWX_CONTROL_ADVERTISE_PORT` and the matching port-forward/firewall rule.
Private-address peers behind NAT need a reachable advertised address and port;
automatic relay and hole punching are not part of this version.

## Trust and recovery

Gossip is encrypted and authenticated with the 32-byte cluster key; incoming
and outgoing verification stay enabled ([memberlist security model](https://github.com/hashicorp/memberlist/blob/master/SECURITY.md)). The key is shared by all cluster
members, so every key holder is trusted to participate in membership gossip.
Protect it like a production secret and restrict gossip traffic with firewall
allowlists. This version does not provide individual node revocation: if the
key is exposed, generate a new key and update every node before restarting the
cluster. The owner token is separate and grants read-only inventory access.

Membership and health are live, in-memory state and are rebuilt as peers
reconnect after a restart. This service is an early fleet-status foundation;
it is not a consensus system and must not be used to coordinate billing,
authentication, or configuration writes.
