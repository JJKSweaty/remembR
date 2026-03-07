# Tailscale Setup for remembR

This guide explains how to set up Tailscale so your phone app can reliably connect to the Raspberry Pi running remembR.

## Why Tailscale?

- **Stable address**: The Pi gets a permanent Tailscale IP and MagicDNS hostname that doesn't change when it reboots or switches networks
- **Private**: Only devices on your tailnet can connect. No public internet exposure
- **No port forwarding**: Works through NATs and firewalls automatically
- **Encrypted**: All traffic is WireGuard-encrypted end-to-end

## Install Tailscale on the Pi

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

This opens a browser link to authenticate. Log in with your Tailscale account.

## Verify Connection

```bash
tailscale status
tailscale ip -4
```

You should see the Pi listed with a 100.x.y.z IP address.

## Install Tailscale on Your Phone

1. Install the Tailscale app from App Store (iOS) or Play Store (Android)
2. Sign in with the same account used on the Pi
3. Enable VPN when prompted

Both devices should now appear in `tailscale status`.

## Find the Pi's Address

### MagicDNS Hostname (preferred)

```bash
# On the Pi:
tailscale status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))"
```

This gives you something like `secondsight.tail12345.ts.net`.

### Tailscale IPv4 (fallback)

```bash
tailscale ip -4
# Example: 100.80.120.45
```

### Quick check with remembR

```bash
cd ~/Desktop/remembR
./run.sh --tailscale-check
```

This prints all available connection URLs.

## Connect Your Phone App

Configure your phone app to use:

**Preferred:**
```
HTTP:      http://secondsight.tail12345.ts.net:8000
WebSocket: ws://secondsight.tail12345.ts.net:8000/ws
```

**Fallback (if hostname resolution fails):**
```
HTTP:      http://100.80.120.45:8000
WebSocket: ws://100.80.120.45:8000/ws
```

Store the hostname in your app, not the IP. The hostname is stable; the IP almost never changes either, but the hostname is the recommended approach.

## Test Connectivity

From a device on the same tailnet:

```bash
# Health check
curl http://secondsight.tail12345.ts.net:8000/health

# WebSocket test (requires wscat: npm install -g wscat)
wscat -c ws://secondsight.tail12345.ts.net:8000/ws
# Type: {"type": "ping"}
# Should receive: {"type": "pong", ...}
```

## Tailscale Serve (Optional)

If you want HTTPS or a clean URL without the port number:

```bash
# Serve remembR on HTTPS at the tailnet domain (port 443, tailnet-only)
sudo tailscale serve --bg 8000
```

Then connect with:
```
https://secondsight.tail12345.ts.net
wss://secondsight.tail12345.ts.net/ws
```

Note: Tailscale Serve in `--bg` mode is tailnet-only by default. Do not use `tailscale funnel` unless you explicitly want public internet access.

## Troubleshooting

### Tailscale not connected

```bash
# Check status
tailscale status

# If stopped, start it
sudo tailscale up

# If expired, re-authenticate
sudo tailscale up --reset
```

### Phone can't reach Pi

1. Verify both devices show as "connected" in the Tailscale admin panel (https://login.tailscale.com/admin)
2. Ensure the Tailscale VPN is enabled on the phone
3. Try pinging: `ping 100.x.y.z` from the phone
4. Check that remembR is running: `curl http://100.x.y.z:8000/health`
5. Check firewall: `sudo ufw status` (if UFW is active, allow port 8000)

### MagicDNS not working

Some networks block DNS resolution for non-standard domains. Fallback to the Tailscale IP address:

```bash
tailscale ip -4
# Use http://100.x.y.z:8000 instead
```

### Connection drops

- Tailscale handles reconnection automatically
- The app should implement WebSocket reconnection (see `docs/mobile_protocol.md`)
- Check `tailscale status` for connectivity issues
