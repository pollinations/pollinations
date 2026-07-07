"""AWS meter connector — Umbrella Cost (Automat-it reseller) usage-month costs.

Witness = Umbrella Cost UM 2.0 Cost & Usage (docs.umbrellacost.io), the
customer-facing meter for everything Automat-it bills us. Auth is a
three-step chain, re-run per invocation (tokens live ~30 minutes):

  POST /api/v1/authentication/token/generate {username, password}
       -> {Authorization, apikey}; the user key is apikey's first segment
  GET  /api/v1/users -> accounts[].accountKey (Umbrella-internal ints)
  GET  /api/v2/invoices/cost-and-usage with apikey "userkey:accountKey:"

The authorization header is the raw token, no Bearer prefix. Data-plane
calls WITHOUT an apikey header hang until a gateway timeout — that was
2026-04's "tenant gate"; AIT enabled API access 2026-07 (Anton/Umbrella).

Two accounts: 813596885972 "AWS NSBU AIT" (original — carries the Bedrock
Claude workloads) and 202731947268 "AWS-Myceli.ai-AIT" (infra refactor).
No rollup overlap (each scope returns only its own account_id), so months
sum across accounts. Coverage starts 2026-04 (AIT onboarding); earlier
months live as manual rows from `aws ce` credit records.

Amount = net-unblended cost + discount costTypes, USD by USAGE month —
AIT's EUR invoices match this to ~0.3% at invoice-date FX. "Credits Usage"
discount rows (new-account promo credits) are netted in; the pool they
burn is a grants-table question, not a meter one.

Rows split by category on the service name: anything Bedrock ("Amazon
Bedrock", "Claude … [Amazon Bedrock Edition]") is compute; everything else
(EC2, CloudFront, RDS, support, plus all discount/credit lines) is infra.
Both categories fund the same pools; only the compute lens cares.

Funding: April 2026 was invoiced cash (ES2601571); from GRANT_FROM the
payer-level credits (MAP et al.) eat each invoice at issue time, so those
usage months book as credit. Flip to cash when the console shows the
pools dry (~Oct 2026 at current burn).

Creds: UMBRELLA_USERNAME, UMBRELLA_PASSWORD.
"""
from ..common import http_json
from . import _mrow

_AUTH_URL = "https://api.umbrellacost.io/api/v1/authentication/token/generate"
_USERS_URL = "https://api.umbrellacost.io/api/v1/users"
_CUE_URL = "https://api.umbrellacost.io/api/v2/invoices/cost-and-usage"

GRANT_FROM = "2026-05"
MONTHS_START = "2026-04"
_COST_TYPES = ("cost", "discount")


def _signin(creds):
    user = creds.get("UMBRELLA_USERNAME")
    password = creds.get("UMBRELLA_PASSWORD")
    if not user or not password:
        raise RuntimeError("UMBRELLA_USERNAME/UMBRELLA_PASSWORD missing")
    d = http_json(_AUTH_URL, data={"username": user, "password": password})
    return d["Authorization"], d["apikey"]


def _headers(auth, apikey):
    return {
        "authorization": auth,
        "apikey": apikey,
        "accept": "application/json",
    }


def _account_keys(auth, apikey):
    d = http_json(_USERS_URL, headers=_headers(auth, apikey))
    keys = [a["accountKey"] for a in d.get("accounts") or []]
    if not keys:
        raise RuntimeError("umbrella returned no accounts")
    return keys


def _category(service_name):
    return "compute" if "bedrock" in (service_name or "").lower() else "infra"


def _cost_pages(auth, userkey, account_key, cost_type, today):
    """Monthly per-service rows for one account and cost type, following nextToken."""
    base = (
        f"{_CUE_URL}?groupBy=service&periodGranLevel=month&isNetUnblended=true"
        f"&costType={cost_type}&startDate={MONTHS_START}-01&endDate={today}"
    )
    token = None
    while True:
        url = base + (f"&token={token}" if token else "")
        d = http_json(
            url,
            headers=_headers(auth, f"{userkey}:{account_key}:"),
            timeout=90,
        )
        for row in d.get("data") or []:
            yield row
        token = d.get("nextToken")
        if not token:
            return


def meter(creds, months, today):
    """AWS net cost per usage month via Umbrella, summed across accounts.

    Args:
        creds:  dict with UMBRELLA_USERNAME / UMBRELLA_PASSWORD
        months: list of "YYYY-MM" strings to emit
        today:  current ingest date

    Returns:
        list of _mrow dicts — one credit or cash row per month and category.
    """
    if not months:
        raise RuntimeError("aws meter requires at least one month")
    auth, apikey = _signin(creds)
    userkey = apikey.split(":")[0]

    totals = {}
    for account_key in _account_keys(auth, apikey):
        for cost_type in _COST_TYPES:
            for row in _cost_pages(auth, userkey, account_key, cost_type, today):
                key = (row["usage_date"], _category(row.get("service_name")))
                totals[key] = totals.get(key, 0.0) + float(row["total_cost"] or 0)

    rows = []
    for month, category in sorted(totals):
        if month not in set(months):
            continue
        amount = round(totals[(month, category)], 2)
        if not amount:
            continue
        funding = "cash" if month < GRANT_FROM else "credit"
        rows.append(_mrow(
            month=month,
            vendor="aws",
            amount=amount,
            funding=funding,
            source="api",
            today=today,
            category=category,
        ))
    return rows
