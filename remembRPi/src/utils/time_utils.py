"""
Time utilities for remembR.

Consistent timestamp formatting and age calculation.
"""

from datetime import datetime, timezone


def now_utc() -> datetime:
    """Return the current UTC time."""
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return now_utc().isoformat()


def age_seconds(dt: datetime) -> float:
    """Return seconds elapsed since the given datetime."""
    return (now_utc() - dt).total_seconds()


def format_age(dt: datetime) -> str:
    """Return a human-readable age string like '2 minutes ago'."""
    seconds = age_seconds(dt)
    if seconds < 5:
        return "just now"
    if seconds < 60:
        return f"{int(seconds)} seconds ago"
    minutes = seconds / 60
    if minutes < 60:
        return f"{int(minutes)} minute{'s' if int(minutes) != 1 else ''} ago"
    hours = minutes / 60
    if hours < 24:
        return f"{int(hours)} hour{'s' if int(hours) != 1 else ''} ago"
    days = hours / 24
    return f"{int(days)} day{'s' if int(days) != 1 else ''} ago"


def parse_iso(s: str) -> datetime:
    """Parse an ISO 8601 datetime string."""
    return datetime.fromisoformat(s)
