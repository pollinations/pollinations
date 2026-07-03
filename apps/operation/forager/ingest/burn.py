"""Burn engine — pure function, no I/O.

Joins invoices, payments, meter, usage, and balances per (provider, month)
into `provider_month` rows and pool-level `grants` rows.

Public API:
    run(invoices, payments, meter, usage, balances, pools, months, config, today)
        -> list[dict]   provider_month rows (full-replace datasource)

    grants(pools, balances, today)
        -> list[dict]   grants rows (pool-level; credits.json base + live overlay)

    CANON : dict   TB model_provider_used -> canonical slug
    NOTES : dict   manual-forever providers -> operator instruction string
"""

# ---------------------------------------------------------------------------
# CANON — ported verbatim from PoC build/csv_build.py `_ALIAS` (line 286)
# and build/build_dashboard.py `PROVIDER_ALIAS` (line 33).
# Only the four aliases that actually appear in Tinybird model_provider_used.
# ---------------------------------------------------------------------------
CANON: dict[str, str] = {
    "aws-bedrock": "aws",
    "bedrock": "aws",
    "vastai": "vast.ai",
    "azure-2": "azure",
}


def _canon(provider: str) -> str:
    """Canonicalize a raw TB model_provider_used value to a credits.json pool slug."""
    p = (provider or "").strip().lower()
    return CANON.get(p, p)


# ---------------------------------------------------------------------------
# NOTES — exact strings per brief rule 8
# ---------------------------------------------------------------------------
_NOTE_TMPL = "console {where} → Billing; then: python3 -m ingest.record meter {slug} {{month}} <usd> --funding credit"

NOTES: dict[str, str] = {
    "io.net":     _NOTE_TMPL.format(where="cloud.io.net", slug="io.net"),
    "perplexity": _NOTE_TMPL.format(where="perplexity.ai", slug="perplexity"),
    "nebius":     _NOTE_TMPL.format(where="nebius.ai",     slug="nebius"),
    "lambda":     _NOTE_TMPL.format(where="lambda.ai",     slug="lambda"),
    "bytedance":  _NOTE_TMPL.format(where="console.volcengine.com", slug="bytedance"),
    "modal":      _NOTE_TMPL.format(where="modal.com",     slug="modal"),
    "elevenlabs": _NOTE_TMPL.format(where="elevenlabs.io", slug="elevenlabs"),
    "daytona":    _NOTE_TMPL.format(where="app.daytona.io", slug="daytona"),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _next_month(month: str) -> str:
    """Return the YYYY-MM string for the month following `month`."""
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        return f"{y + 1:04d}-01"
    return f"{y:04d}-{m + 1:02d}"


def _month_start(month: str) -> str:
    """ISO datetime for the first instant of month (used for snapshot comparisons)."""
    return f"{month}-01 00:00:00"


def _month_end(month: str) -> str:
    """ISO datetime for the first instant of the month AFTER month (exclusive upper bound)."""
    return f"{_next_month(month)}-01 00:00:00"


_SOURCE_RANK = {"api": 0, "cli": 1, "bq": 2, "manual": 3}


def _src_rank(s: str) -> int:
    return _SOURCE_RANK.get(s, 99)


# ---------------------------------------------------------------------------
# _pick_meter — rule 3
# ---------------------------------------------------------------------------

def _pick_meter(meter_rows: list[dict]) -> tuple[float, float, float, str, str]:
    """Return (cash_usd, prepaid_usd, credit_usd, meter_src, credit_meter_src).

    Precedence: api > cli > bq > manual (manual fills only when no api/cli/bq present).
    Within a source, latest retrieved_at wins.
    Each funding class (cash / prepaid / credit) is resolved independently under the
    same source-precedence rule.
    `meter_src` = best source across all funding classes (for the meter_src column).
    `credit_meter_src` = source of the credit funding row specifically (for rule 4 dispatch).
    """
    if not meter_rows:
        return 0.0, 0.0, 0.0, "", ""

    # Group by (funding, source) → keep latest retrieved_at row per group
    best: dict[tuple[str, str], dict] = {}
    for row in meter_rows:
        funding = row.get("funding", "")
        source = row.get("source", "manual")
        key = (funding, source)
        existing = best.get(key)
        if existing is None or (row.get("retrieved_at", "") > existing.get("retrieved_at", "")):
            best[key] = row

    # For each funding class, pick best source (manual only fills holes)
    def _pick_funding(funding: str) -> tuple[float, str]:
        candidates = [(k, v) for k, v in best.items() if k[0] == funding]
        if not candidates:
            return 0.0, ""
        non_manual = [c for c in candidates if c[0][1] != "manual"]
        if non_manual:
            candidates = non_manual
        candidates.sort(key=lambda kv: _src_rank(kv[0][1]))
        winner = candidates[0][1]
        return float(winner.get("cost_usd", 0.0)), winner.get("source", "")

    cash_usd, cash_src = _pick_funding("cash")
    prepaid_usd, prepaid_src = _pick_funding("prepaid")
    credit_usd, credit_src = _pick_funding("credit")

    # Overall meter_src = best source across any funding class
    srcs = [s for s in (cash_src, prepaid_src, credit_src) if s]
    overall_src = min(srcs, key=_src_rank) if srcs else ""

    return cash_usd, prepaid_usd, credit_usd, overall_src, credit_src


# ---------------------------------------------------------------------------
# _pick_grant_left — rule 6
# ---------------------------------------------------------------------------

def _pick_grant_left(provider: str, balances_by_prov: dict[str, list[dict]],
                     pool: dict | None) -> tuple[float | None, str]:
    """Return (left_usd, src) for grant_left_usd/grant_src."""
    rows = balances_by_prov.get(provider, [])
    # Filter to rows where left_usd is not None
    with_left = [r for r in rows if r.get("left_usd") is not None]

    if with_left:
        # Latest snapshot by run_at
        best = max(with_left, key=lambda r: r.get("run_at", ""))
        src_raw = best.get("source", "")
        src = "api" if src_raw in ("api", "cli") else "manual"
        return float(best["left_usd"]), src

    # HC fallback
    if pool is not None:
        left = pool.get("left")
        if left is not None:
            return float(left), "hc"

    return 0.0, ""


# ---------------------------------------------------------------------------
# _credit_burn — rule 4
# ---------------------------------------------------------------------------

def _credit_burn(provider: str, month: str,
                 credit_meter_usd: float, credit_meter_src: str,
                 balances_by_prov: dict[str, list[dict]]) -> tuple[float, str, str]:
    """Return (burn_usd, src, note_override).

    Priority:
    1. credit-funded meter from api/cli/bq  → src 'meter'
    2. balance delta (api|cli only, both distinct snapshots required, delta ≥ 0)  → src 'delta'
    3. manual meter credit row              → src 'manual'
    4. 0.0 / '' / needs_data note
    """
    # Rule 4-1: credit meter from a programmatic source (api/cli/bq)
    if credit_meter_usd > 0.0 and credit_meter_src in ("api", "cli", "bq"):
        return round(credit_meter_usd, 2), "meter", ""

    # Rule 4-2: balance delta
    rows = balances_by_prov.get(provider, [])
    api_rows = [r for r in rows
                if r.get("source") in ("api", "cli") and r.get("left_usd") is not None]

    month_start = _month_start(month)   # e.g. "2026-06-01 00:00:00"
    month_end = _month_end(month)       # e.g. "2026-07-01 00:00:00"

    # Latest snapshot at-or-before month start (run_at <= month_start)
    before = [r for r in api_rows if r.get("run_at", "") <= month_start]
    # Latest snapshot WITHIN or at month end: run_at > month_start AND run_at < month_end
    # This ensures we have an actual end-of-month reading, not just the same pre-month snapshot.
    during = [r for r in api_rows
              if r.get("run_at", "") > month_start and r.get("run_at", "") < month_end]
    # Also accept a snapshot exactly at month end (first instant of next month)
    at_end_exact = [r for r in api_rows if r.get("run_at", "") == month_end]
    in_or_after = during + at_end_exact

    if before and in_or_after:
        snap_start = max(before, key=lambda r: r["run_at"])
        snap_end = max(in_or_after, key=lambda r: r["run_at"])
        delta = float(snap_start["left_usd"]) - float(snap_end["left_usd"])
        if delta >= 0.0:
            return round(delta, 2), "delta", ""
        # Negative delta → top-up → fall through

    # Rule 4-3: manual meter credit row
    if credit_meter_usd > 0.0 and credit_meter_src == "manual":
        return round(credit_meter_usd, 2), "manual", ""

    # Needs-data fallthrough
    note = NOTES.get(provider, f"python3 -m ingest.record meter {provider} {{month}} <usd> --funding credit")
    return 0.0, "", note


# ---------------------------------------------------------------------------
# _is_grant_pool — determines which providers get credit_burn logic
# ---------------------------------------------------------------------------

def _is_grant_pool(pool: dict) -> bool:
    """True when the pool's cost vehicle is credit/grant (not cash invoices).

    Either sponsored billing (azure) or kind==grant (aws-style monthly grant pools)
    activates the credit_burn / needs_data logic.
    """
    return pool.get("billing") == "sponsored" or pool.get("kind") == "grant"


# ---------------------------------------------------------------------------
# _status — rule 7 (first match wins)
# ---------------------------------------------------------------------------

def _status(provider: str, billing: str, is_grant: bool,
            invoice_usd: float, cash_usd: float,
            meter_cash_usd: float, meter_prepaid_usd: float,
            credit_burn_usd: float, credit_src: str,
            usage_cost_usd: float, in_pool: bool) -> str:
    """Return status string following rule 7 precedence."""
    # needs_data: sponsored/grant pool with no credit signal
    if is_grant and credit_src == "":
        return "needs_data"

    # needs_data: usage_cost > 1 with no invoice/cash/meter and not in any pool
    if usage_cost_usd > 1.0 and invoice_usd == 0.0 and cash_usd == 0.0 \
            and meter_cash_usd == 0.0 and meter_prepaid_usd == 0.0 and not in_pool:
        return "needs_data"

    # grant_burn: sponsored/grant AND (usage_cost > 1 OR credit_burn > 0)
    if is_grant and (usage_cost_usd > 1.0 or credit_burn_usd > 0.0):
        return "grant_burn"

    # usage_no_invoice: usage_cost > 1, no invoice, no cash, NOT in a grant pool
    if usage_cost_usd > 1.0 and invoice_usd == 0.0 and cash_usd == 0.0 and not is_grant:
        return "usage_no_invoice"

    # quiet: all signals ≈ 0
    if (invoice_usd < 1.0 and cash_usd < 1.0 and meter_cash_usd < 1.0
            and meter_prepaid_usd < 1.0 and credit_burn_usd < 1.0
            and usage_cost_usd < 1.0):
        return "quiet"

    return "ok"


# ---------------------------------------------------------------------------
# run — main engine
# ---------------------------------------------------------------------------

def run(invoices: list[dict], payments: list[dict], meter: list[dict],
        usage: list[dict], balances: list[dict], pools: list[dict],
        months: list[str], config: dict, today: str) -> list[dict]:
    """Compute provider_month rows.

    Args:
        invoices:  invoice rows from TB (status, period_month, provider, amount_usd, ...)
        payments:  payment rows from TB (month, provider, amount_usd, ...)
        meter:     meter_monthly rows from TB (month, provider, cost_usd, funding, source, ...)
        usage:     usage_monthly rows from TB (month, provider RAW, cost_paid, cost_quest, ...)
        balances:  balances rows from TB (run_at, provider canonical, left_usd, source, ...)
        pools:     list of pool dicts from load_credits() (same structure as gaps.py)
        months:    list of "YYYY-MM" strings to evaluate
        config:    dict (currently unused; reserved for future config keys)
        today:     "YYYY-MM-DD" run_at stamp

    Returns:
        list of provider_month row dicts (full-replace datasource)
    """
    # ---- 1. Build provider → pool metadata index (first pool wins) ----
    prov_pool: dict[str, dict] = {}
    for pool in pools:
        for prov in pool.get("providers", []):
            p = prov.strip().lower()
            if p and p not in prov_pool:
                prov_pool[p] = pool

    # ---- 2. Canonicalize usage providers and index inputs ----

    # invoice index: (provider, month) -> list of invoice rows
    inv_idx: dict[tuple[str, str], list[dict]] = {}
    for r in invoices:
        p = (r.get("provider") or "").strip().lower()
        m = r.get("period_month", "")
        if p and m:
            inv_idx.setdefault((p, m), []).append(r)

    # payment index: (provider, month) -> list of payment rows
    # Exclude rows with empty provider (unmatched)
    pay_idx: dict[tuple[str, str], list[dict]] = {}
    for r in payments:
        p = (r.get("provider") or "").strip().lower()
        m = r.get("month", "")
        if p and m:
            pay_idx.setdefault((p, m), []).append(r)

    # meter index: (provider, month) -> list of meter rows
    meter_idx: dict[tuple[str, str], list[dict]] = {}
    for r in meter:
        p = (r.get("provider") or "").strip().lower()
        m = r.get("month", "")
        if p and m:
            meter_idx.setdefault((p, m), []).append(r)

    # usage index: (canonical_provider, month) -> sum of cost_paid + cost_quest
    usage_idx: dict[tuple[str, str], float] = {}
    for r in usage:
        raw_p = r.get("provider") or ""
        p = _canon(raw_p)
        m = r.get("month", "")
        if not m:
            continue
        cost = float(r.get("cost_paid") or 0.0) + float(r.get("cost_quest") or 0.0)
        usage_idx[(p, m)] = usage_idx.get((p, m), 0.0) + cost

    # balances index: provider -> list of balance rows
    bal_by_prov: dict[str, list[dict]] = {}
    for r in balances:
        p = (r.get("provider") or "").strip().lower()
        if p:
            bal_by_prov.setdefault(p, []).append(r)

    # ---- 3. Build universe ----
    universe: set[tuple[str, str]] = set()

    # Every pool provider × every month
    for prov in prov_pool:
        for m in months:
            universe.add((prov, m))

    # Every month with data in any input
    all_data_months = set(months)
    for (p, m) in inv_idx:
        all_data_months.add(m)
        universe.add((p, m))
    for (p, m) in pay_idx:
        all_data_months.add(m)
        universe.add((p, m))
    for (p, m) in meter_idx:
        all_data_months.add(m)
        universe.add((p, m))
    for (p, m) in usage_idx:
        all_data_months.add(m)
        universe.add((p, m))

    # ---- 4. Compute one row per (provider, month) ----
    results: list[dict] = []

    for (provider, month) in sorted(universe):
        pool = prov_pool.get(provider)
        billing = pool.get("billing", "") if pool else ""
        is_grant = _is_grant_pool(pool) if pool else False
        in_pool = pool is not None

        # Rule 2: invoice_usd
        inv_rows = inv_idx.get((provider, month), [])
        invoice_usd = sum(
            (float(r.get("amount_usd") or 0.0)
             for r in inv_rows if r.get("status") == "parsed"),
            0.0,
        )

        # Rule 2: cash_usd
        pay_rows = pay_idx.get((provider, month), [])
        cash_usd = sum((float(r.get("amount_usd") or 0.0) for r in pay_rows), 0.0)

        # Rule 3: meter split
        m_rows = meter_idx.get((provider, month), [])
        meter_cash_usd, meter_prepaid_usd, credit_meter_usd, meter_src, credit_meter_src = _pick_meter(m_rows)

        # Rule 5: usage_cost_usd
        usage_cost_usd = usage_idx.get((provider, month), 0.0)

        # Rule 6: grant_left
        grant_left_usd, grant_src = _pick_grant_left(provider, bal_by_prov, pool)

        # Rule 4: credit_burn (only for grant/sponsored pools)
        credit_burn_usd = 0.0
        credit_src = ""
        burn_note = ""
        if is_grant:
            credit_burn_usd, credit_src, burn_note = _credit_burn(
                provider, month, credit_meter_usd, credit_meter_src, bal_by_prov
            )

        # Rule 7: status
        status = _status(
            provider, billing, is_grant,
            invoice_usd, cash_usd,
            meter_cash_usd, meter_prepaid_usd,
            credit_burn_usd, credit_src,
            usage_cost_usd, in_pool,
        )

        # Note: use burn_note when needs_data
        note = burn_note if status == "needs_data" and burn_note else ""

        results.append({
            "month": month,
            "provider": provider,
            "billing": billing,
            "invoice_usd": round(invoice_usd, 2),
            "cash_usd": round(cash_usd, 2),
            "meter_cash_usd": round(meter_cash_usd, 2),
            "meter_prepaid_usd": round(meter_prepaid_usd, 2),
            "meter_src": meter_src,
            "usage_cost_usd": round(usage_cost_usd, 2),
            "credit_burn_usd": round(credit_burn_usd, 2),
            "credit_src": credit_src,
            "grant_left_usd": round(float(grant_left_usd), 2),
            "grant_src": grant_src,
            "status": status,
            "note": note,
            "run_at": today,
        })

    return results


# ---------------------------------------------------------------------------
# grants — pool-level merged view
# ---------------------------------------------------------------------------

def grants(pools: list[dict], balances: list[dict], today: str) -> list[dict]:
    """Compute grants rows (pool-level view: credits.json base + latest live overlay).

    Base values come from credits.json (src 'hc'). The latest balance snapshot
    for any provider in the pool overlays with src 'api' (api/cli) or 'manual'.
    None values are preserved (Nullable columns in TB).

    Args:
        pools:     list of pool dicts from load_credits()
        balances:  all balances rows from TB (provider, run_at, granted_usd, left_usd,
                   prepaid_left_usd, source, ...)
        today:     "YYYY-MM-DD" run_at stamp

    Returns:
        list of grants row dicts (full-replace datasource)
    """
    # Index balances by provider → list of rows
    bal_by_prov: dict[str, list[dict]] = {}
    for r in balances:
        p = (r.get("provider") or "").strip().lower()
        if p:
            bal_by_prov.setdefault(p, []).append(r)

    rows: list[dict] = []
    for pool in pools:
        pool_name = pool.get("pool", "")
        provs = [p.strip().lower() for p in pool.get("providers", []) if p]
        kind = pool.get("kind", "")

        # Base from credits.json (hc)
        hc_granted = pool.get("granted")
        hc_left = pool.get("left")
        hc_prepaid_left = pool.get("cash_left")

        # Find the latest balance snapshot across all pool providers
        best_bal: dict | None = None
        for prov in provs:
            for r in bal_by_prov.get(prov, []):
                if best_bal is None or r.get("run_at", "") > best_bal.get("run_at", ""):
                    best_bal = r

        if best_bal is not None:
            live_src_raw = best_bal.get("source", "")
            live_src = "api" if live_src_raw in ("api", "cli") else "manual"

            # Overlay granted_usd if present in snapshot
            live_granted = best_bal.get("granted_usd")
            granted_usd = live_granted if live_granted is not None else hc_granted
            granted_src = live_src if live_granted is not None else ("hc" if hc_granted is not None else "")

            # Overlay left_usd
            live_left = best_bal.get("left_usd")
            left_usd = live_left if live_left is not None else hc_left
            left_src = live_src if live_left is not None else ("hc" if hc_left is not None else "")

            # Overlay prepaid_left_usd
            live_prepaid = best_bal.get("prepaid_left_usd")
            if live_prepaid is not None:
                prepaid_left_usd = live_prepaid
                prepaid_left_src = live_src
            elif hc_prepaid_left is not None:
                prepaid_left_usd = hc_prepaid_left
                prepaid_left_src = "hc"
            else:
                prepaid_left_usd = None
                prepaid_left_src = ""
        else:
            # Pure HC
            granted_usd = hc_granted
            granted_src = "hc" if hc_granted is not None else ""
            left_usd = hc_left
            left_src = "hc" if hc_left is not None else ""
            prepaid_left_usd = hc_prepaid_left
            prepaid_left_src = "hc" if hc_prepaid_left is not None else ""

        rows.append({
            "pool": pool_name,
            "providers": ",".join(provs),
            "kind": kind,
            "currency": pool.get("currency", "USD"),
            "granted_usd": granted_usd,
            "granted_src": granted_src,
            "left_usd": left_usd,
            "left_src": left_src,
            "prepaid_left_usd": prepaid_left_usd,
            "prepaid_left_src": prepaid_left_src,
            "expires": pool.get("expires", ""),
            "note": pool.get("note", ""),
            "run_at": today,
        })

    return rows
