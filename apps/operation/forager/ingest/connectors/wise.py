"""Wise connector — per-transaction outflow emitter.

Pulls the Wise Activities API (no SCA needed) month by month and returns one
payments row per outgoing transaction. Unmatched counterparties keep provider=''
so payroll/office stay visible for future runway/infra UIs.

Row shape matches the `payments` Tinybird datasource exactly:
    paid_at, month, provider, counterparty, amount_eur, amount_usd,
    wise_ref, pulled_at
"""
import urllib.parse
from .common import http_json, strip_html

# provider key -> counterparty substrings (lowercased)
# Intentionally UNMATCHED: "Amazon" (retail — office hardware, NOT AWS; Elliot confirmed 2026-07-02),
# payroll/rent/tools (Deel, Gaswerksiedlung, GitHub, Tinybird, Notion, ...) — they are ops, not compute.
ALIAS = {
    "google":       ["google cloud", "google cloud emea"],
    "aws":          ["automat-it", "amazon web", "aws emea"],
    "alibaba":      ["alibaba", "aliyun", "ant alibaba"],
    "azure":        ["microsoft", "azure"],
    "runpod":       ["runpod"],
    "lambda":       ["lambda labs", "lambda cloud"],
    "deepinfra":    ["deepinfra", "deep infra"],
    "fireworks":    ["fireworks"],
    "openrouter":   ["openrouter"],
    "openai":       ["openai"],
    "anthropic":    ["anthropic", "claude"],
    "xai":          ["grok", "x.ai", "xai"],
    "replicate":    ["replicate"],
    "cloudflare":   ["cloudflare"],
    "ovhcloud":     ["ovh"],
    "elevenlabs":   ["elevenlabs", "eleven labs"],
    "perplexity":   ["perplexity"],
    "scaleway":     ["scaleway"],
    "modal":        ["modal"],
    "digitalocean": ["digitalocean", "digital ocean"],
    "vast.ai":      ["vast.ai", "vast ai"],
    "daytona":      ["daytona"],
    "io.net":       ["io.net", "io net"],
    "bytedance":    ["byteplus", "bytedance"],
    "fal":          ["fal.ai", "fal ai"],
    "pruna":        ["pruna"],
    "stability":    ["stability"],
    "assemblyai":   ["assemblyai", "assembly ai"],
}


def _amount(raw):
    parts = strip_html(raw).split()
    if len(parts) < 2:
        return 0.0, "EUR"
    cur = parts[-1]
    num = "".join(parts[:-1]).replace("+", "").replace(",", "")
    try:
        return float(num), cur
    except ValueError:
        return 0.0, cur


def _match(counterparty):
    low = counterparty.lower()
    for prov, subs in ALIAS.items():
        if any(s in low for s in subs):
            return prov
    return None


def _fetch_month(creds, month):
    """All activities for `month`, following the pagination cursor until exhausted.
    Wise returns `cursor` (null on the last page); it goes back as `nextCursor`."""
    tok = creds.get("WISE_API_TOKEN")
    pid = creds.get("WISE_BUSINESS_PROFILE_ID")
    if not tok or not pid:
        raise RuntimeError("WISE_API_TOKEN / WISE_BUSINESS_PROFILE_ID missing")
    y, m = [int(x) for x in month.split("-")]
    since = f"{month}-01T00:00:00.000Z"
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    until = f"{ny:04d}-{nm:02d}-01T00:00:00.000Z"
    base = (f"https://api.wise.com/v1/profiles/{pid}/activities"
            f"?size=100&since={since}&until={until}")
    acts, cursor = [], None
    for _ in range(50):                                    # hard stop: 5,000 activities/month
        url = base + (f"&nextCursor={urllib.parse.quote(cursor, safe='')}" if cursor else "")
        data = http_json(url, {"Authorization": f"Bearer {tok}"})
        page = data.get("activities", []) or []
        acts.extend(page)
        cursor = data.get("cursor")
        if not cursor or not page:
            break
    else:
        raise RuntimeError(f"wise {month}: cursor still live after 50 pages — refusing a partial pull")
    print(f"    wise {month}: {len(acts)} activities")    # visible count so a silent drop can't hide
    return acts


def outflow_rows(creds, months, fx, today):
    """One payments row per outgoing Wise transaction. Unmatched counterparties keep
    provider='' — payroll/office stay visible for future runway/infra UIs."""
    rows = []
    for month in months:
        for a in _fetch_month(creds, month):
            if a.get("status") not in ("COMPLETED", "IN_PROGRESS") or a.get("type") == "CARD_CHECK":
                continue
            cp = strip_html(a.get("title", ""))
            pv, pc = _amount(a.get("primaryAmount", ""))
            sv, _ = _amount(a.get("secondaryAmount", ""))
            eur = pv if pc == "EUR" else (sv if sv else pv)
            if "positive" not in (a.get("primaryAmount") or "") and eur > 0:
                eur = -eur
            if eur >= 0:
                continue
            rows.append({"paid_at": (a.get("createdOn") or f"{month}-15")[:10], "month": month,
                         "provider": _match(cp) or "", "counterparty": cp,
                         "amount_eur": round(-eur, 2), "amount_usd": round(-eur * fx, 2),
                         "wise_ref": str(a.get("id") or ""), "pulled_at": today})
    return rows
