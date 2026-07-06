"""Shared HTTP / date / HTML helpers for direct vendor connectors.

Severed copy: only the helpers needed by the connectors live here.
Credential loading lives exclusively in ingest/creds.py — never here.
"""
import json as _json
import re
import urllib.request

UA = "Mozilla/5.0 (pollinations-finops-connector)"


def http_json(url, headers=None, timeout=30, data=None, method=None):
    """GET or POST a JSON endpoint, always setting the User-Agent header.

    Args:
        url:     Request URL.
        headers: Extra headers dict (merged after UA).
        timeout: Socket timeout in seconds.
        data:    If a dict, JSON-encodes it and sends as POST body with
                 Content-Type: application/json.  If bytes, sends as-is.
                 None → GET (unless method overrides).
        method:  Explicit HTTP method override (e.g. "POST" with no body).

    """
    h = {"User-Agent": UA, **(headers or {})}
    body = None
    if isinstance(data, dict):
        body = _json.dumps(data).encode()
        h.setdefault("Content-Type", "application/json")
    elif isinstance(data, (bytes, bytearray)):
        body = data
    effective_method = method or ("POST" if body is not None else "GET")
    req = urllib.request.Request(url, data=body, headers=h, method=effective_method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return _json.load(r)


def months_ytd(start="2026-01", today=None):
    """List of 'YYYY-MM' from start through the current month."""
    import datetime
    t = today or datetime.date.today().isoformat()
    ey, em = int(t[:4]), int(t[5:7])
    y, m = [int(x) for x in start.split("-")]
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def strip_html(s):
    while re.search(r"<[^>]+>", s or ""):
        s = re.sub(r"<[^>]+>", "", s)
    return (s or "").strip()
