# ==============================================================================
# MWX-ISP — MikroTik RouterOS Quick Integration Script
# Compatible with RouterOS v6.48+ and v7.x
#
# Instructions:
# 1. Replace YOUR_MWX_SERVER_IP with the public/VPN IP of your MWX-ISP server.
# 2. Replace YOUR_RADIUS_SECRET with the Shared Secret registered in MWX-ISP.
# 3. Paste these commands into your MikroTik Terminal (CLI) or WinBox New Terminal.
# ==============================================================================

# 1. Register MWX-ISP as the RADIUS Server for PPPoE and Hotspot
/radius
add address=YOUR_MWX_SERVER_IP \
    secret="YOUR_RADIUS_SECRET" \
    authentication-port=1812 \
    accounting-port=1813 \
    timeout=3000ms \
    service=ppp,hotspot \
    comment="MWX-ISP Primary RADIUS Server"

# 2. Enable Incoming Dynamic Authorization (RFC 5176 CoA / Disconnect)
# CRITICAL: This allows MWX-ISP to immediately disconnect or change
# customer speed when invoices are overdue or payments are received.
/radius incoming
set accept=yes port=3799

# 3. Configure PPP AAA to use RADIUS & periodic accounting updates
/ppp aaa
set use-radius=yes \
    accounting=yes \
    interim-update=5m

# 4. Create standard MWX-ISP PPP Profile for PPPoE clients
/ppp profile
add name="mwx-isp-default" \
    only-one=yes \
    use-encryption=yes \
    use-compression=no \
    use-mpls=no \
    change-tcp-mss=yes \
    comment="Default MWX-ISP PPPoE profile"

# 5. Enable PPPoE Server with RADIUS profile (adjust 'interface' to your LAN/WAN)
# /interface pppoe-server server
# add service-name="mwx-pppoe" interface=ether2 default-profile="mwx-isp-default" one-session-per-host=yes disabled=no

# ==============================================================================
# VSA REFERENCE (HANDLED AUTOMATICALLY BY MWX-ISP):
# - Rate Limiting: Emitted as Mikrotik-Rate-Limit (Vendor ID 14988, VSA 8)
#   Format: "rx-rate/tx-rate [burst-rx/burst-tx burst-threshold burst-time priority]"
#   Example: "10M/20M"
# - Dynamic IP Allocation: Framed-IP-Address or Framed-Pool
# - CoA Disconnect: Sent to UDP port 3799 with Message-Authenticator
# ==============================================================================
