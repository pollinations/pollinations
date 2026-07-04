"""Grant / balance overlay — pool-level `grants` rows.

The P&L burn engine (`provider_month`) and reconciliation were removed
2026-07-04. Crossing the raw planes (invoices, payments, meter, balances) now
happens in the treasury frontend and the spend-audit PoC — a simple minus — not
in a codified engine here. This module only builds the pool-level `grants` view:
the credits.json base, superseded by operator overrides, superseded by the
latest live balance snapshot.

Public API:
    grants(pools, balances, today, overrides, cat_map)
        -> list[dict]   grants rows (pool-level; credits.json base + live overlay)

    CANON : dict   TB model_provider_used -> canonical slug
"""

# Model-tag aliases (TB model_provider_used -> canonical) live in
# ingest/aliases.py now — the one home for hand-coded provider identity.
from .aliases import MODEL_TAG_ALIASES as CANON


def _canon(provider: str) -> str:
    """Canonicalize a raw TB model_provider_used value to a credits.json pool slug."""
    p = (provider or "").strip().lower()
    return CANON.get(p, p)


_NA_STRINGS = {"n/a", "na", ""}


def _num(v) -> float | None:
    """Coerce a pool-sourced value to float, or None if absent/non-numeric.

    Accepts:
    - None / '' / 'n/a' / 'NA' / 'na' (case-insensitive, stripped) → None
    - numeric types (int, float) → float
    - numeric strings, including comma-formatted e.g. "31,212.50" → float
    - any other string or unparseable value → None
    """
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.lower() in _NA_STRINGS:
        return None
    # Strip commas (thousands separator) before parsing
    s = s.replace(",", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# grants — pool-level merged view
# ---------------------------------------------------------------------------


def grants(
    pools: list[dict],
    balances: list[dict],
    today: str,
    overrides: dict | None = None,
    cat_map: dict | None = None,
) -> list[dict]:
    """Compute grants rows (pool-level view: credits.json base + latest live overlay).

    Base values come from credits.json (src 'hc'), superseded by operator
    overrides (src 'manual') from the `overrides` datasource, superseded by
    the latest live balance snapshot (src 'api'/'manual').
    Precedence per field: live API > override > credits.json hc.
    None values are preserved (Nullable columns in TB).

    overrides: {("grants", pool_name, field): value_num} — latest per key,
    as built by run.py from the overrides datasource. Fields: granted_usd,
    left_usd, prepaid_left_usd.
    cat_map: {slug: category} — pool category = category of its first mapped
    provider (cloudflare pool → infra), default 'compute'.

    Args:
        pools:     list of pool dicts from load_credits()
        balances:  all balances rows from TB (provider, run_at, granted_usd, left_usd,
                   prepaid_left_usd, source, ...)
        today:     current ingest date

    Returns:
        list of grants row dicts (full-replace datasource)
    """
    overrides = overrides or {}
    cat_map = cat_map or {}

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
        # Base from credits.json (hc) — coerce through _num to tolerate "n/a", "NA", "", etc.
        # An operator override (overrides datasource) supersedes the hc value.
        def _base(field, hc_key):
            ov = overrides.get(("grants", pool_name, field))
            if ov is not None:
                return _num(ov), "manual"
            v = _num(pool.get(hc_key))
            return v, ("hc" if v is not None else "")

        hc_granted, hc_granted_src = _base("granted_usd", "granted")
        hc_left, hc_left_src = _base("left_usd", "left")
        hc_prepaid_left, hc_prepaid_src = _base("prepaid_left_usd", "cash_left")

        # Find the latest balance snapshot across all pool providers.
        # Canonicalize each provider slug so alias slugs (azure-2, bedrock (native))
        # resolve to the same canonical key used when indexing balances.
        best_bal: dict | None = None
        for prov in provs:
            canon_prov = _canon(prov)
            for r in bal_by_prov.get(canon_prov, []):
                if best_bal is None or r.get("run_at", "") > best_bal.get("run_at", ""):
                    best_bal = r

        if best_bal is not None:
            live_src_raw = best_bal.get("source", "")
            live_src = "api" if live_src_raw in ("api", "cli") else "manual"

            # Overlay granted_usd if present in snapshot
            live_granted = best_bal.get("granted_usd")
            granted_usd = live_granted if live_granted is not None else hc_granted
            granted_src = live_src if live_granted is not None else hc_granted_src

            # Overlay left_usd
            live_left = best_bal.get("left_usd")
            left_usd = live_left if live_left is not None else hc_left
            left_src = live_src if live_left is not None else hc_left_src

            # Overlay prepaid_left_usd
            live_prepaid = best_bal.get("prepaid_left_usd")
            if live_prepaid is not None:
                prepaid_left_usd = live_prepaid
                prepaid_left_src = live_src
            else:
                prepaid_left_usd = hc_prepaid_left
                prepaid_left_src = hc_prepaid_src
        else:
            # Pure HC / override
            granted_usd = hc_granted
            granted_src = hc_granted_src
            left_usd = hc_left
            left_src = hc_left_src
            prepaid_left_usd = hc_prepaid_left
            prepaid_left_src = hc_prepaid_src

        category = next((cat_map[p] for p in provs if p in cat_map), "compute")

        rows.append(
            {
                "pool": pool_name,
                "providers": ",".join(provs),
                "category": category,
                "granted_usd": granted_usd,
                "granted_src": granted_src,
                "left_usd": left_usd,
                "left_src": left_src,
                "prepaid_left_usd": prepaid_left_usd,
                "prepaid_left_src": prepaid_left_src,
                "expires": pool.get("expires", ""),
            }
        )

    return rows
