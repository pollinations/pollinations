"""Shared HTTP / date / HTML helpers for direct provider connectors.

Severed copy: only the helpers needed by the connectors live here.
Credential loading lives exclusively in ingest/creds.py — never here.
"""
import json as _json, os as _os, re, urllib.request

UA = "Mozilla/5.0 (pollinations-finops-connector)"

# FX rate read from config.json at module load — single source of truth.
FX_EUR_USD = _json.load(open(_os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
    "config.json")))["fx_eur_usd"]


def http_json(url, headers=None, timeout=30):
    h = {"User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, headers=h)
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
