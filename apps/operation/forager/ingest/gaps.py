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


def _next_month(month):
    """Return the YYYY-MM string for the month following the given one.

    Uses only stdlib datetime — no dateutil dependency.
    December wraps correctly: "2025-12" → "2026-01".
    """
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        return f"{y + 1:04d}-01"
    return f"{y:04d}-{m + 1:02d}"


def _verdict_row(provider, month, billing, status, today,
                 invoice_usd=0.0, payment_usd=0.0, payment_refs="", invoice_refs="",
                 note=""):
    """Return a dict matching the Tinybird `reconciliation` datasource schema exactly.

    Columns: month, provider, billing, status, invoice_usd, payment_usd,
             delta_usd, invoice_refs, payment_refs, note, run_at
    """
    return {
        "month": month,
        "provider": provider,
        "billing": billing,
        "status": status,
        "invoice_usd": round(invoice_usd, 2),
        "payment_usd": round(payment_usd, 2),
        "delta_usd": round(invoice_usd - payment_usd, 2),
        "invoice_refs": invoice_refs,
        "payment_refs": payment_refs,
        "note": note,
        "run_at": today,
    }


def _pool_active(pool, month):
    """True if month falls within [active_from, active_until or open]."""
    af = pool.get("active_from", "1900-01")
    au = pool.get("active_until", "9999-99")
    return af <= month <= au


def _accepted_key(month, provider):
    return f"{month}:{provider}"


def _reconcile_monthly(provider, month, billing, inv_rows, pay_rows, cfg, today,
                       used_wise_refs=None):
    """Reconcile a monthly/reseller/subscription provider for one month.

    Logic (amended 2026-07-03 — nearest-payment matching):
    - inv_rows: invoices with period_month == month.
    - pay_rows: candidate payments in M..M+1 window; caller supplies both months.
    - used_wise_refs: run-wide set of wise_refs already consumed by earlier months
      (mutated in-place so claims propagate across the caller's month loop).
    - accepted check first.
    - If only needs_label invoices → needs_label.
    - If no parsed invoices → missing_invoice.
    - Parsed invoices present: greedy-match each invoice to the nearest-dated UNUSED payment
      in pay_rows (filtered through used_wise_refs) within tolerance.
      - no unused payment found within tolerance → nearest available → amount_mismatch;
        no unused payment at all → missing_payment.
      - all matched → ok.
    """
    if used_wise_refs is None:
        used_wise_refs = set()

    accepted = cfg.get("recon_accepted", [])
    if _accepted_key(month, provider) in accepted:
        inv_sum = sum(r.get("amount_usd", 0.0) for r in inv_rows if r.get("status") == "parsed")
        pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
        refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
        shas = ",".join(r.get("sha256", "") for r in inv_rows if r.get("sha256"))
        return _verdict_row(provider, month, billing, "accepted", today,
                            inv_sum, pay_sum, refs, shas)

    parsed = [r for r in inv_rows if r.get("status") == "parsed"]
    needs = [r for r in inv_rows if r.get("status") == "needs_label"]

    if not parsed and not needs:
        # No invoices at all
        available = [r for r in pay_rows if r.get("wise_ref") not in used_wise_refs]
        pay_sum = sum(r.get("amount_usd", 0.0) for r in available)
        refs = ",".join(r.get("wise_ref", "") for r in available if r.get("wise_ref"))
        return _verdict_row(provider, month, billing, "missing_invoice", today,
                            0.0, pay_sum, refs)

    if not parsed and needs:
        # Only needs_label, no parsed invoices
        shas = ",".join(r.get("sha256", "") for r in needs if r.get("sha256"))
        available = [r for r in pay_rows if r.get("wise_ref") not in used_wise_refs]
        pay_sum = sum(r.get("amount_usd", 0.0) for r in available)
        refs = ",".join(r.get("wise_ref", "") for r in available if r.get("wise_ref"))
        return _verdict_row(provider, month, billing, "needs_label", today,
                            0.0, pay_sum, refs, shas)

    # Parsed invoices present — greedy nearest-payment match
    pct = cfg.get("recon_tolerance_pct", 0.02)
    usd = cfg.get("recon_tolerance_usd", 2.0)

    matched_pays = []   # payments successfully claimed by this invoice set
    last_verdict = "ok"

    all_shas = ",".join(r.get("sha256", "") for r in parsed if r.get("sha256"))

    for inv in parsed:
        inv_amt = inv.get("amount_usd", 0.0)
        issued_at = inv.get("issued_at", "")

        # Candidates: unused payments in the M..M+1 window
        candidates = [r for r in pay_rows if r.get("wise_ref") not in used_wise_refs]

        if not candidates:
            last_verdict = "missing_payment"
            continue

        # Find nearest candidate by |paid_at − issued_at|
        best = min(candidates, key=lambda r: _days_diff(r.get("paid_at", ""), issued_at))
        best_ref = best.get("wise_ref", "")

        if _within(inv_amt, best.get("amount_usd", 0.0), pct, usd):
            # Matched within tolerance → ok
            used_wise_refs.add(best_ref)
            matched_pays.append(best)
        else:
            # Nearest payment exists but is outside tolerance → amount_mismatch
            # Still consume it (greedy) so it isn't double-claimed by another invoice
            used_wise_refs.add(best_ref)
            matched_pays.append(best)
            last_verdict = "amount_mismatch"

    inv_sum = sum(r.get("amount_usd", 0.0) for r in parsed)
    pay_sum = sum(r.get("amount_usd", 0.0) for r in matched_pays)
    refs = ",".join(r.get("wise_ref", "") for r in matched_pays if r.get("wise_ref"))

    return _verdict_row(provider, month, billing, last_verdict, today,
                        inv_sum, pay_sum, refs, all_shas)


def _reconcile_prepaid(provider, month, billing, inv_rows, pay_rows, cfg, today):
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
        return _verdict_row(provider, month, billing, "accepted", today,
                            inv_sum, pay_sum, refs, shas)

    parsed = [r for r in inv_rows if r.get("status") == "parsed"]
    needs = [r for r in inv_rows if r.get("status") == "needs_label"]

    # No activity at all → ok
    if not parsed and not needs and not pay_rows:
        return _verdict_row(provider, month, billing, "ok", today)

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
        return _verdict_row(provider, month, billing, "needs_label", today,
                            0.0, pay_sum, refs, shas)

    if unmatched_pay:
        # Payment exists but no matching invoice
        pay_sum = sum(r.get("amount_usd", 0.0) for r in unmatched_pay)
        refs = ",".join(r.get("wise_ref", "") for r in unmatched_pay if r.get("wise_ref"))
        inv_sum = sum(r.get("amount_usd", 0.0) for r in [p for p in pay_rows if p not in unmatched_pay])
        shas = ",".join(r.get("sha256", "") for r in [unused_inv[i] for i in matched_inv_idxs] if r.get("sha256"))
        return _verdict_row(provider, month, billing, "missing_invoice", today,
                            inv_sum, pay_sum, refs, shas)

    if unmatched_inv:
        inv_sum = sum(r.get("amount_usd", 0.0) for r in unmatched_inv)
        shas = ",".join(r.get("sha256", "") for r in unmatched_inv if r.get("sha256"))
        return _verdict_row(provider, month, billing, "missing_payment", today,
                            inv_sum, 0.0, "", shas)

    # All payments matched
    inv_sum = sum(r.get("amount_usd", 0.0) for r in parsed)
    pay_sum = sum(r.get("amount_usd", 0.0) for r in pay_rows)
    refs = ",".join(r.get("wise_ref", "") for r in pay_rows if r.get("wise_ref"))
    shas = ",".join(r.get("sha256", "") for r in parsed if r.get("sha256"))
    return _verdict_row(provider, month, billing, "ok", today,
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
        today:     ISO date string "YYYY-MM-DD" (used for active window checks and run_at)

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

    # Global set of wise_refs consumed by monthly reconciliation this run.
    # Keyed per provider so a July payment claimed by Google's June invoice
    # is unavailable only for Google's July — not for other providers.
    used_wise_refs_by_prov: dict = {}

    results = []
    # Process months in ascending order so that earlier months claim their payments first
    for month in sorted(months):
        next_m = _next_month(month)
        for prov_key, meta in prov_pool.items():
            # Skip if not active in this month
            if not (meta["active_from"] <= month <= meta["active_until"]):
                continue

            billing = meta["billing"]

            # sponsored → ok_credit immediately, no invoice/payment needed
            if billing == "sponsored":
                results.append(_verdict_row(prov_key, month, billing, "ok_credit", today))
                continue

            # Filter relevant rows for this provider×month
            inv_rows = [r for r in invoices
                        if r.get("provider", "").strip().lower() == prov_key
                        and r.get("period_month", "") == month]

            # Payments window depends on billing type:
            # - monthly/reseller/subscription: [M, M+1] arrears window (monthly invoices are
            #   often paid in the following month; a payment in M+1 will also appear in M+1's
            #   own exact-month slice — that overlap is inherent to the plan's definition).
            #   Each payment is consumed at most once across the whole run per provider.
            # - prepaid: exact month M only (top-ups are matched by date ±10d, not arrears)
            if billing in ("monthly", "reseller", "subscription"):
                pay_rows = [r for r in payments
                            if r.get("provider", "").strip().lower() == prov_key
                            and r.get("month", "") in (month, next_m)]
                prov_used = used_wise_refs_by_prov.setdefault(prov_key, set())
                results.append(_reconcile_monthly(
                    prov_key, month, billing, inv_rows, pay_rows, config, today,
                    used_wise_refs=prov_used))
            elif billing == "prepaid":
                pay_rows = [r for r in payments
                            if r.get("provider", "").strip().lower() == prov_key
                            and r.get("month", "") == month]
                results.append(_reconcile_prepaid(
                    prov_key, month, billing, inv_rows, pay_rows, config, today))
            else:
                # Unknown billing type — treat as monthly (include M+1 arrears)
                pay_rows = [r for r in payments
                            if r.get("provider", "").strip().lower() == prov_key
                            and r.get("month", "") in (month, next_m)]
                prov_used = used_wise_refs_by_prov.setdefault(prov_key, set())
                results.append(_reconcile_monthly(
                    prov_key, month, billing, inv_rows, pay_rows, config, today,
                    used_wise_refs=prov_used))

    return results
