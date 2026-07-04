"""Wise connector — per-transaction outflow emitter.

Pulls the Wise Activities API (no SCA needed) month by month and returns one
payments row per outgoing transaction. Unmatched counterparties keep provider=''
so payroll/office stay visible for future runway/infra UIs.

Row shape matches the `payments` Tinybird datasource exactly:
    paid_at, provider, counterparty, amount_eur, wise_ref
"""
import urllib.parse
from .common import http_json, strip_html
from ..aliases import PROVIDER_ALIASES as ALIAS

# The central provider + alias list lives in ingest/aliases.py now (not Wise-
# specific — it just happens to be matched against Wise counterparties here).
# Operating-expense classification stays here since it also carries a category.
OPS_ALIAS = [
    ("deel", "payroll", ["lets deel", "deel"]),
    ("enty", "admin", ["enty"]),
    ("wise", "admin", ["wise"]),
    ("github", "saas", ["github"]),
    ("slack", "saas", ["slack"]),
    ("typeless", "saas", ["typeless"]),
    ("wispr", "saas", ["wispr"]),
    ("tinybird", "infra", ["tinybird"]),
    ("tele2", "office", ["tele2"]),
    ("naturenergie", "office", ["naturenergie"]),
    ("", "admin", ["tax", "steuer", "consult", "accounting", "bookkeeping", "legal", "notary"]),
    ("", "office", ["amazon", "gaswerksiedlung", "zara home", "denns biomarkt", "canva"]),
]


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


def _ops_match(counterparty):
    low = counterparty.lower()
    words = low.replace("-", " ").replace("_", " ").split()
    for provider, category, subs in OPS_ALIAS:
        for s in subs:
            if len(s) <= 2:
                if s in words:
                    return provider, category
            elif s in low:
                return provider, category
    return "", ""


def _payment_category(provider, counterparty, slug_cat):
    low = counterparty.lower()
    if provider in ("anthropic", "openai", "xai", "perplexity") and any(
        s in low for s in ("subscription", "claude", "chatgpt", "gemini", "grok")
    ):
        return "saas"
    if provider:
        return slug_cat.get(provider, "compute")
    _provider, category = _ops_match(counterparty)
    return category or "unmatched"


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


def outflow_rows(creds, months):
    """One payments row per outgoing Wise transaction. Unmatched counterparties keep
    provider='' for unknown counterparties; category still separates admin,
    office, payroll, saas, and truly unmatched spend.

    category = the provider's default category from the harvest classifier
    (deel → payroll, tinybird → infra, GPU/API providers → compute), with
    direct operating-expense matches for bank/card counterparties."""
    from ..invoices.harvest import PROVIDERS
    slug_cat = {slug: cat for slug, cat, _ in PROVIDERS}
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
            prov = _match(cp) or ""
            ops_prov, ops_category = _ops_match(cp) if not prov else ("", "")
            prov = prov or ops_prov
            rows.append({"paid_at": (a.get("createdOn") or f"{month}-15")[:10],
                         "provider": prov, "counterparty": cp,
                         "category": (
                             ops_category if ops_category
                             else _payment_category(prov, cp, slug_cat)
                         ),
                         "amount_eur": round(-eur, 2),
                         "wise_ref": str(a.get("id") or "")})
    return rows
