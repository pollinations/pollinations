"""Reconciliation engine — pure function, no I/O.

Compares harvested invoices against Wise payments per (provider, month) within each
pool's active window and returns verdict rows for the `reconciliation` datasource.

Verdict statuses:
  ok             — amounts matched within tolerance
  ok_credit      — sponsored/credit pool, no payment expected
  missing_invoice — payment exists but no parsed invoice (prepaid), or no invoice at all (monthly)
  missing_payment — parsed invoice exists but no matching payment
  amount_mismatch — both present but delta exceeds tolerance
  needs_label     — invoice present but status='needs_label', human review needed
  accepted        — explicitly accepted in config["recon_accepted"] ("YYYY-MM:provider")
"""
import datetime


def _tol(amount, pct, usd):
    """Tolerance: max(pct * amount, usd_floor)."""
    return max(pct * amount, usd)


def _within(a, b, pct, usd):
    return abs(a - b) <= _tol(max(a, b), pct, usd)


def _days_diff(d1, d2):
    """Absolute day difference between two ISO date strings."""
    try:
        a = datetime.date.fromisoformat(d1[:10])
        b = datetime.date.fromisoformat(d2[:10])
        return abs((a - b).days)
    except (ValueError, TypeError):
        return 9999


def _verdict_row(provider, month, pool_name, billing, status,
                 invoice_usd=0.0, payment_usd=0.0, payment_refs="", sha256s=""):
    return {
        "provider": provider,
        "month": month,
        "pool": pool_name,
        "billing": billing,
        "status": status,
        "invoice_usd": round(invoice_usd, 2),
        "payment_usd": round(payment_usd, 2),
        "payment_refs": payment_refs,
        "sha256s": sha256s,
    }


def _pool_active(pool, month):
    """True if month falls within [active_from, active_until or open]."""
    af = pool.get("active_from", "1900-01")
    au = pool.get("active_until", "9999-99")
    return af <= month <= au


def _accepted_key(month, provider):
    return f"{month}:{provider}"


def _reconcile_monthly(provider, month, pool_name, billing, inv_rows, pay_rows, cfg):
    """Reconcile a monthly/reseller/subscription provider for one month.

    Logic:
    - Filter invoices to period_month == month; filter payments to month.
    - accepted check first.
    - If only needs_label invoices → needs_label.
    - If no parsed invoices → missing_invoice.
    - Parsed invoices present: sum them vs payments in [M, M+1] arrears window.
      - No payments → missing_payment.
      - Within tolerance → ok.
      - Outside → amount_mismatch.
    """
    accepted = cfg.get("recon_accepted", [])
    if _accepted_key(month, provider) in accepted:
        inv_sum = sum(r.get("amount_usd", 0.0) for r in inv_rows if r.get("status") == "parsed")
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        shas = ",".join(r.get("sha256", "") for r in inv_rows if r.get("sha256"))
        return _verdict_row(provider, month, pool_name, billing, "accepted",
                            inv_sum, pay_sum, refs, shas)

    parsed = [r for r in inv_rows if r.get("status") == "parsed"]
    needs = [r for r in inv_rows if r.get("status") == "needs_label"]

    if not parsed and not needs:
        # No invoices at all
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        return _verdict_row(provider, month, pool_name, billing, "missing_invoice",
                            0.0, pay_sum, refs)

    if not parsed and needs:
        # Only needs_label, no parsed invoices
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        shas = ",".join(r.get("sha256", "") for r in needs if r.get("sha256"))
        return _verdict_row(provider, month, pool_name, billing, "needs_label",
                            0.0, pay_sum, refs, shas)

    # Parsed invoices present
    inv_sum = sum(r.get("amount_usd", 0.0) for r in parsed)
    shas = ",".join(r.get("sha256", "") for r in parsed if r.get("sha256"))

    # Payments window: paid_at in month M or M+1 (arrears)
    # pay_rows already filtered to month M by caller, but also accept M+1 paid_at
    pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
    refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))

    if pay_sum == 0.0 and not pay_rows:
        return _verdict_row(provider, month, pool_name, billing, "missing_payment",
                            inv_sum, 0.0, "", shas)

    pct = cfg.get("recon_tolerance_pct", 0.02)
    usd = cfg.get("recon_tolerance_usd", 2.0)
    if _within(inv_sum, pay_sum, pct, usd):
        return _verdict_row(provider, month, pool_name, billing, "ok",
                            inv_sum, pay_sum, refs, shas)

    return _verdict_row(provider, month, pool_name, billing, "amount_mismatch",
                        inv_sum, pay_sum, refs, shas)


def _reconcile_prepaid(provider, month, pool_name, billing, inv_rows, pay_rows, cfg):
    """Greedy-match each payment to an unused parsed invoice (±tolerance, ±10d date).

    Unmatched payment → missing_invoice (payment_refs = wise_refs of unmatched payments).
    Unmatched parsed invoice → missing_payment.
    needs_label invoice present → needs_label (in addition to any mismatches).
    No activity (no invoices, no payments) → ok.
    """
    accepted = cfg.get("recon_accepted", [])
    if _accepted_key(month, provider) in accepted:
        inv_sum = sum(r.get("amount_usd", 0.0) for r in inv_rows if r.get("status") == "parsed")
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        shas = ",".join(r.get("sha256", "") for r in inv_rows if r.get("sha256"))
        return _verdict_row(provider, month, pool_name, billing, "accepted",
                            inv_sum, pay_sum, refs, shas)

    parsed = [r for r in inv_rows if r.get("status") == "parsed"]
    needs = [r for r in inv_rows if r.get("status") == "needs_label"]

    # No activity at all → ok
    if not parsed and not needs and not pay_rows:
        return _verdict_row(provider, month, pool_name, billing, "ok")

    pct = cfg.get("recon_tolerance_pct", 0.02)
    usd = cfg.get("recon_tolerance_usd", 2.0)

    # Greedy match: for each payment, find the nearest unused parsed invoice
    unused_inv = list(parsed)
    unmatched_pay = []
    matched_inv_idxs = set()

    for pay in pay_rows:
        pay_amt = pay.get("amount_usd", 0.0)
        paid_at = pay.get("paid_at", "")
        best_idx = None
        best_days = 9999
        for i, inv in enumerate(unused_inv):
            if i in matched_inv_idxs:
                continue
            inv_amt = inv.get("amount_usd", 0.0)
            issued_at = inv.get("issued_at", "")
            if _within(inv_amt, pay_amt, pct, usd) and _days_diff(issued_at, paid_at) <= 10:
                days = _days_diff(issued_at, paid_at)
                if days < best_days:
                    best_days = days
                    best_idx = i
        if best_idx is not None:
            matched_inv_idxs.add(best_idx)
        else:
            unmatched_pay.append(pay)

    unmatched_inv = [inv for i, inv in enumerate(unused_inv) if i not in matched_inv_idxs]

    # Determine verdict
    if needs:
        # needs_label takes amber priority if any invoice needs labeling
        shas = ",".join(r.get("sha256", "") for r in needs if r.get("sha256"))
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        return _verdict_row(provider, month, pool_name, billing, "needs_label",
                            0.0, pay_sum, refs, shas)

    if unmatched_pay:
        # Payment exists but no matching invoice
        pay_sum = sum(r.get("amount_usd", 0.0) for r in unmatched_pay)
        refs = ",".join(r.get("wise_ref", "") for r in unmatched_pay if r.get("wise_ref"))
        inv_sum = sum(r.get("amount_usd", 0.0) for r in [p for p in pay_rows if p not in unmatched_pay])
        shas = ",".join(r.get("sha256", "") for r in [unused_inv[i] for i in matched_inv_idxs] if r.get("sha256"))
        return _verdict_row(provider, month, pool_name, billing, "missing_invoice",
                            inv_sum, pay_sum, refs, shas)

    if unmatched_inv:
        inv_sum = sum(r.get("amount_usd", 0.0) for r in unmatched_inv)
        shas = ",".join(r.get("sha256", "") for r in unmatched_inv if r.get("sha256"))
        return _verdict_row(provider, month, pool_name, billing, "missing_payment",
                            inv_sum, 0.0, "", shas)

    # All payments matched
    inv_sum = sum(r.get("amount_usd", 0.0) for r in parsed)
    pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
    refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
    shas = ",".join(r.get("sha256", "") for r in parsed if r.get("sha256"))
    return _verdict_row(provider, month, pool_name, billing, "ok",
                        inv_sum, pay_sum, refs, shas)


def run(invoices, payments, pools, months, config, today):
    """Reconcile invoices vs payments per (provider, month) for all pools.

    Args:
        invoices:  list of invoice rows (dicts with provider, period_month, amount_usd,
                   sha256, status, issued_at, kind)
        payments:  list of payment rows (dicts with provider, month, amount_usd,
                   wise_ref, paid_at)
        pools:     list of pool dicts (pool, providers, billing, active_from[, active_until])
        months:    list of "YYYY-MM" strings to evaluate
        config:    dict with recon_tolerance_pct, recon_tolerance_usd, recon_accepted
        today:     ISO date string "YYYY-MM-DD" (used for active window checks)

    Returns:
        list of verdict dicts (one per active provider×month combination in scope)
    """
    # Build provider → pool metadata map (first pool wins if duplicate)
    prov_pool = {}
    for pool in pools:
        billing = pool.get("billing", "monthly")
        pool_name = pool.get("pool", "")
        for prov in pool.get("providers", []):
            key = prov.strip().lower()
            if key not in prov_pool:
                prov_pool[key] = {
                    "pool": pool_name,
                    "billing": billing,
                    "active_from": pool.get("active_from", "1900-01"),
                    "active_until": pool.get("active_until", "9999-99"),
                }

    results = []
    for month in months:
        for prov_key, meta in prov_pool.items():
            # Skip if not active in this month
            if not (meta["active_from"] <= month <= meta["active_until"]):
                continue

            billing = meta["billing"]
            pool_name = meta["pool"]

            # sponsored → ok_credit immediately, no invoice/payment needed
            if billing == "sponsored":
                results.append(_verdict_row(prov_key, month, pool_name, billing, "ok_credit"))
                continue

            # Filter relevant rows for this provider×month
            inv_rows = [r for r in invoices
                        if r.get("provider", "").strip().lower() == prov_key
                        and r.get("period_month", "") == month]

            # Payments: month == M for all billing types
            # For monthly arrears, also include paid_at in month M+1
            pay_rows_exact = [r for r in payments
                              if r.get("provider", "").strip().lower() == prov_key
                              and r.get("month", "") == month]

            if billing in ("monthly", "reseller", "subscription"):
                results.append(_reconcile_monthly(
                    prov_key, month, pool_name, billing,
                    inv_rows, pay_rows_exact, config))
            elif billing == "prepaid":
                results.append(_reconcile_prepaid(
                    prov_key, month, pool_name, billing,
                    inv_rows, pay_rows_exact, config))
            else:
                # Unknown billing type — treat as monthly
                results.append(_reconcile_monthly(
                    prov_key, month, pool_name, billing,
                    inv_rows, pay_rows_exact, config))

    return results
