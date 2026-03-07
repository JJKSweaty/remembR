"""
Tailscale utility functions for remembR.

Detects Tailscale installation, connection status, IPv4, and MagicDNS hostname.
Prints connection info at startup so the phone app developer knows what URL to use.
"""

import subprocess
import socket

from src.utils.logging_utils import get_logger


def is_tailscale_installed() -> bool:
    """Check if the tailscale binary is available."""
    try:
        result = subprocess.run(
            ["which", "tailscale"], capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def get_tailscale_ip() -> str | None:
    """Get the Tailscale IPv4 address."""
    try:
        result = subprocess.run(
            ["tailscale", "ip", "-4"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return None


def get_tailscale_hostname() -> str | None:
    """Get the Tailscale MagicDNS hostname.

    Tries `tailscale status --json` first, then falls back to
    `tailscale status` parsing, then the system hostname.
    """
    try:
        import json as _json
        result = subprocess.run(
            ["tailscale", "status", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            data = _json.loads(result.stdout)
            # The "Self" entry has our own info
            self_info = data.get("Self", {})
            dns_name = self_info.get("DNSName", "")
            if dns_name:
                # DNSName ends with trailing dot, remove it
                return dns_name.rstrip(".")
            # Fall back to HostName
            host_name = self_info.get("HostName", "")
            if host_name:
                return host_name
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError, Exception):
        pass

    # Fallback: system hostname
    try:
        return socket.gethostname()
    except Exception:
        return None


def get_tailscale_status() -> dict:
    """Get comprehensive Tailscale status information.

    Returns:
        Dict with keys: installed, connected, ip, hostname, magic_dns, warning.
    """
    log = get_logger()

    status = {
        "installed": False,
        "connected": False,
        "ip": None,
        "hostname": None,
        "magic_dns": None,
        "warning": None,
    }

    if not is_tailscale_installed():
        status["warning"] = (
            "Tailscale is not installed. Install it with: "
            "curl -fsSL https://tailscale.com/install.sh | sh"
        )
        log.warning(status["warning"])
        return status

    status["installed"] = True

    # Check connection
    try:
        result = subprocess.run(
            ["tailscale", "status"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and "stopped" not in result.stdout.lower():
            status["connected"] = True
        else:
            status["warning"] = (
                "Tailscale is installed but not connected. "
                "Run: sudo tailscale up"
            )
            log.warning(status["warning"])
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        status["warning"] = "Could not check Tailscale status"

    # Get IP and hostname
    if status["connected"]:
        status["ip"] = get_tailscale_ip()
        status["hostname"] = get_tailscale_hostname()

        # Derive MagicDNS URL if hostname looks like a tailnet address
        if status["hostname"] and "." in status["hostname"]:
            status["magic_dns"] = status["hostname"]

    return status


def print_connection_info(port: int = 8000) -> dict:
    """Print startup connection info for the phone app developer.

    Shows both Tailscale and local network URLs.
    Returns the Tailscale status dict.
    """
    log = get_logger()
    ts = get_tailscale_status()

    log.info("=" * 60)
    log.info("remembR Connection Info")
    log.info("=" * 60)

    if ts["connected"] and ts["hostname"]:
        log.info("  Preferred HTTP URL:      http://%s:%d", ts["hostname"], port)
        log.info("  Preferred WebSocket URL: ws://%s:%d/ws", ts["hostname"], port)

    if ts["connected"] and ts["ip"]:
        log.info("  Fallback HTTP URL:       http://%s:%d", ts["ip"], port)
        log.info("  Fallback WebSocket URL:  ws://%s:%d/ws", ts["ip"], port)

    # Also show local LAN IP for debugging
    local_ip = _get_local_ip()
    if local_ip:
        log.info("  Local LAN HTTP URL:      http://%s:%d", local_ip, port)
        log.info("  Local LAN WebSocket URL: ws://%s:%d/ws", local_ip, port)

    if ts.get("warning"):
        log.warning("  ⚠ %s", ts["warning"])

    log.info("=" * 60)
    return ts


def _get_local_ip() -> str | None:
    """Get the local LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None
