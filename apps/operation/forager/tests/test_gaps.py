from ingest import gaps

CFG = {"recon_tolerance_pct": 0.02, "recon_tolerance_usd": 2.0, "recon_accepted": []}
POOLS = [
    {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    {"pool": "RunPod", "providers": ["runpod"], "billing": "prepaid", "active_from": "2026-01"},
    {"pool": "Azure spons", "providers": ["azure"], "billing": "sponsored", "active_from": "2026-01"},
]

def _pm(provider, month="2026-06", credit=0.0, usage=0.0):
    return {
        "month": month,
        "provider": provider,
        "category": "compute",
        "invoice_usd": 0.0,
        "meter_cash_usd": 0.0,
        "meter_prepaid_usd": 0.0,
        "meter_src": "",
        "usage_cost_usd": usage,
        "credit_burn_usd": credit,
        "credit_src": "manual" if credit else "",
        "status": "ok",
    }


def _run(inv=[], pay=[], months=["2026-06"], pm=[]):
    return gaps.run(inv, pay, POOLS, months, CFG, today="2026-07-02",
                    provider_month=pm)

def test_monthly_active_window_without_evidence_is_quiet():
    r = next(x for x in _run() if x["provider"] == "google")     # active, no invoice, no payment
    assert r["status"] == "quiet"

def test_before_active_from_expects_nothing():
    rows = gaps.run([], [], [{"pool": "Late", "providers": ["late"], "billing": "monthly",
                              "active_from": "2026-06"}], ["2026-05"], CFG, today="2026-07-02")
    assert not [x for x in rows if x["provider"] == "late" and x["status"] != "ok"]

def test_prepaid_payment_without_invoice():
    r = next(x for x in _run(pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 500.0,
                                   "wise_ref": "w2", "paid_at": "2026-06-10"}])
             if x["provider"] == "runpod")
    assert r["status"] == "missing_invoice" and r["payment_refs"] == "w2"

def test_prepaid_matched_within_tolerance_is_ok():
    r = next(x for x in _run(
        inv=[{"provider": "runpod", "kind": "prepaid_topup", "period_month": "2026-06",
              "amount_usd": 495.0, "sha256": "b2", "status": "parsed", "issued_at": "2026-06-11"}],
        pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 500.0,
              "wise_ref": "w2", "paid_at": "2026-06-10"}]) if x["provider"] == "runpod")
    assert r["status"] == "ok"                # delta 5 ≤ max(2%·500, $2) = 10

def test_needs_review_is_amber_not_ok():
    r = next(x for x in _run(inv=[{"provider": "google", "kind": "monthly_bill",
                                   "period_month": "2026-06", "amount_usd": 0.0,
                                   "sha256": "c3", "status": "needs_review"}])
             if x["provider"] == "google")
    assert r["status"] == "needs_review"

def test_sponsored_without_evidence_is_quiet():
    assert next(x for x in _run() if x["provider"] == "azure")["status"] == "quiet"


def test_zero_invoice_is_ok_credit():
    r = next(x for x in _run(inv=[{"provider": "google", "kind": "monthly_bill",
                                   "period_month": "2026-06", "amount_usd": 0.0,
                                   "sha256": "zero", "status": "parsed",
                                   "issued_at": "2026-06-01"}])
             if x["provider"] == "google")
    assert r["status"] == "ok_credit"
    assert r["invoice_refs"] == "zero"


def test_credit_burn_evidence_is_ok_credit():
    r = next(x for x in _run(pm=[_pm("azure", credit=242.45)])
             if x["provider"] == "azure")
    assert r["status"] == "ok_credit"


def test_usage_only_is_needs_data():
    r = next(x for x in _run(pm=[_pm("azure", usage=242.45)])
             if x["provider"] == "azure")
    assert r["status"] == "needs_data"


def test_mixed_zero_and_payable_invoice_matches_payment():
    rows = _run(
        inv=[
            {"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
             "amount_usd": 0.0, "sha256": "zero", "status": "parsed",
             "issued_at": "2026-06-01"},
            {"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
             "amount_usd": 500.0, "sha256": "payable", "status": "parsed",
             "issued_at": "2026-06-02"},
        ],
        pay=[{"provider": "google", "month": "2026-07", "amount_usd": 500.0,
              "wise_ref": "w-payable", "paid_at": "2026-07-05"}],
    )
    r = next(x for x in rows if x["provider"] == "google")
    assert r["status"] == "ok"
    assert r["invoice_usd"] == 500.0
    assert r["payment_refs"] == "w-payable"


# ── Finding 1: cross-month arrears window ─────────────────────────────────────

def test_monthly_arrears_m_plus_1_is_ok():
    """A monthly invoice for M with its only payment in M+1 (within tolerance) must be ok."""
    r = next(x for x in gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 1000.0, "sha256": "sha-m1", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-07", "amount_usd": 1000.0,
          "wise_ref": "w-m1", "paid_at": "2026-07-05"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    ) if x["provider"] == "google")
    assert r["status"] == "ok", f"expected ok, got {r['status']}"


def test_monthly_exact_month_payment_still_ok():
    """Sanity: a monthly invoice paid in same month M is still ok (regression guard)."""
    r = next(x for x in gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 800.0, "sha256": "sha-m2", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-06", "amount_usd": 800.0,
          "wise_ref": "w-m2", "paid_at": "2026-06-28"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    ) if x["provider"] == "google")
    assert r["status"] == "ok", f"expected ok, got {r['status']}"


def test_monthly_arrears_december_wraps_to_january():
    """December (2025-12) invoice paid in January 2026 (M+1 = 2026-01) must be ok."""
    dec_pool = [{"pool": "GCP", "providers": ["gcp"], "billing": "monthly",
                 "active_from": "2025-01"}]
    r = next(x for x in gaps.run(
        [{"provider": "gcp", "kind": "monthly_bill", "period_month": "2025-12",
          "amount_usd": 500.0, "sha256": "sha-dec", "status": "parsed", "issued_at": "2025-12-01"}],
        [{"provider": "gcp", "month": "2026-01", "amount_usd": 500.0,
          "wise_ref": "w-jan", "paid_at": "2026-01-10"}],
        dec_pool, ["2025-12"], CFG, today="2026-07-02",
    ) if x["provider"] == "gcp")
    assert r["status"] == "ok", f"expected ok for Dec→Jan arrears, got {r['status']}"


def test_monthly_m_plus_2_payment_is_missing_payment():
    """Payment in M+2 is outside the arrears window — should be missing_payment for M."""
    r = next(x for x in gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 1000.0, "sha256": "sha-m3", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-08", "amount_usd": 1000.0,
          "wise_ref": "w-aug", "paid_at": "2026-08-05"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    ) if x["provider"] == "google")
    assert r["status"] == "missing_payment", f"expected missing_payment, got {r['status']}"


# ── Finding 2: reconciliation datasource schema alignment ─────────────────────

def test_verdict_row_has_required_schema_keys():
    """Every verdict row must match the Tinybird reconciliation datasource schema exactly.
    delta_usd is computed in the gaps_ep pipe; run freshness lives in ingest_runs."""
    required = {"month", "provider", "billing", "status", "invoice_usd", "payment_usd",
                "invoice_refs", "payment_refs", "note"}
    forbidden = {"pool", "sha256s", "delta_usd", "run_at"}
    rows = gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 200.0, "sha256": "sha-s1", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-06", "amount_usd": 200.0,
          "wise_ref": "w-s1", "paid_at": "2026-06-28"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    )
    r = next(x for x in rows if x["provider"] == "google")
    missing_keys = required - set(r.keys())
    extra_keys = forbidden & set(r.keys())
    assert not missing_keys, f"missing schema keys: {missing_keys}"
    assert not extra_keys, f"forbidden keys present: {extra_keys}"


def test_verdict_row_amounts_correct():
    """invoice_usd/payment_usd must carry the matched sums (delta_usd = invoice - payment
    is derived from these two in the gaps_ep pipe)."""
    rows = gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 300.0, "sha256": "sha-d1", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-06", "amount_usd": 295.0,
          "wise_ref": "w-d1", "paid_at": "2026-06-28"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    )
    r = next(x for x in rows if x["provider"] == "google")
    assert r["invoice_usd"] == 300.0
    assert r["payment_usd"] == 295.0


def test_verdict_row_invoice_refs_is_string():
    """invoice_refs must be a string (comma-joined sha256s), not a list."""
    rows = gaps.run(
        [{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
          "amount_usd": 100.0, "sha256": "abc123", "status": "parsed", "issued_at": "2026-06-01"}],
        [{"provider": "google", "month": "2026-06", "amount_usd": 100.0,
          "wise_ref": "w-r1", "paid_at": "2026-06-10"}],
        POOLS, ["2026-06"], CFG, today="2026-07-02",
    )
    r = next(x for x in rows if x["provider"] == "google")
    assert isinstance(r["invoice_refs"], str), f"invoice_refs should be str, got {type(r['invoice_refs'])}"
    assert "abc123" in r["invoice_refs"]


def test_verdict_row_note_is_string():
    """note must be a string (empty string is fine)."""
    rows = gaps.run([], [], POOLS, ["2026-06"], CFG, today="2026-07-02")
    r = next(x for x in rows if x["provider"] == "azure")
    assert isinstance(r["note"], str), f"note should be str, got {type(r['note'])}"


# ── Finding 3: inactive window emits no rows at all ──────────────────────────

def test_before_active_from_emits_no_rows():
    """An inactive provider in a month before active_from must produce ZERO rows."""
    rows = gaps.run([], [], [{"pool": "Late", "providers": ["late"], "billing": "monthly",
                               "active_from": "2026-06"}], ["2026-05"], CFG, today="2026-07-02")
    late_rows = [x for x in rows if x["provider"] == "late"]
    assert len(late_rows) == 0, f"expected 0 rows, got {late_rows}"


# ── Change 1: nearest-payment matching (plan amendment 2026-07-03) ────────────

def test_steady_payer_three_months_all_ok():
    """Steady payer: 3 monthly invoices (issued ~1st), 3 payments each landing early the FOLLOWING
    month, all within tolerance → ALL THREE months verdict ok and each payment used exactly once.
    This is the scenario the old Σ semantics failed (June's invoice consumed July's payment, leaving
    July with no payment → missing_payment).
    """
    steady_pools = [
        {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    ]
    invoices = [
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-05",
         "amount_usd": 1000.0, "sha256": "s-may", "status": "parsed", "issued_at": "2026-05-01"},
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
         "amount_usd": 1000.0, "sha256": "s-jun", "status": "parsed", "issued_at": "2026-06-01"},
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-07",
         "amount_usd": 1000.0, "sha256": "s-jul", "status": "parsed", "issued_at": "2026-07-01"},
    ]
    # Each payment lands the 5th of the following month
    payments = [
        {"provider": "google", "month": "2026-06", "amount_usd": 1000.0,
         "wise_ref": "w-may-pay", "paid_at": "2026-06-05"},
        {"provider": "google", "month": "2026-07", "amount_usd": 1000.0,
         "wise_ref": "w-jun-pay", "paid_at": "2026-07-05"},
        {"provider": "google", "month": "2026-08", "amount_usd": 1000.0,
         "wise_ref": "w-jul-pay", "paid_at": "2026-08-05"},
    ]
    rows = gaps.run(
        invoices, payments, steady_pools,
        ["2026-05", "2026-06", "2026-07"], CFG, today="2026-08-10",
    )
    by_month = {r["month"]: r for r in rows if r["provider"] == "google"}
    for m in ("2026-05", "2026-06", "2026-07"):
        assert by_month[m]["status"] == "ok", (
            f"month {m} expected ok, got {by_month[m]['status']}"
        )
    # Each payment used exactly once: refs must each appear in exactly one verdict row
    refs_used = [r["payment_refs"] for r in by_month.values()]
    assert "w-may-pay" in refs_used[0] or "w-may-pay" in refs_used[1] or "w-may-pay" in refs_used[2]
    all_refs = ",".join(refs_used)
    assert all_refs.count("w-may-pay") == 1, "w-may-pay used more than once"
    assert all_refs.count("w-jun-pay") == 1, "w-jun-pay used more than once"
    assert all_refs.count("w-jul-pay") == 1, "w-jul-pay used more than once"


def test_payment_claimed_by_june_unavailable_for_july():
    """A payment matched to June's invoice must NOT be reusable by July.
    If only June's payment exists and both months are reconciled, July must be missing_payment.
    """
    steady_pools = [
        {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    ]
    invoices = [
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
         "amount_usd": 1000.0, "sha256": "s-jun2", "status": "parsed", "issued_at": "2026-06-01"},
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-07",
         "amount_usd": 1000.0, "sha256": "s-jul2", "status": "parsed", "issued_at": "2026-07-01"},
    ]
    # Only one payment in July window — June's invoice would claim it if not globally consumed
    payments = [
        {"provider": "google", "month": "2026-07", "amount_usd": 1000.0,
         "wise_ref": "w-shared", "paid_at": "2026-07-05"},
    ]
    rows = gaps.run(
        invoices, payments, steady_pools,
        ["2026-06", "2026-07"], CFG, today="2026-08-10",
    )
    by_month = {r["month"]: r for r in rows if r["provider"] == "google"}
    # June should claim w-shared (nearest payment in M..M+1)
    assert by_month["2026-06"]["status"] == "ok", (
        f"June expected ok, got {by_month['2026-06']['status']}"
    )
    # July has no remaining unused payment → missing_payment
    assert by_month["2026-07"]["status"] == "missing_payment", (
        f"July expected missing_payment, got {by_month['2026-07']['status']}"
    )


def test_nearest_payment_selected_over_farther():
    """When two candidate payments are in the M..M+1 window, the closer-dated one is chosen."""
    steady_pools = [
        {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    ]
    invoices = [
        {"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
         "amount_usd": 1000.0, "sha256": "s-near", "status": "parsed", "issued_at": "2026-06-15"},
    ]
    payments = [
        # close: 5 days from issued_at (June 15 → June 20), within tolerance
        {"provider": "google", "month": "2026-06", "amount_usd": 1000.0,
         "wise_ref": "w-close", "paid_at": "2026-06-20"},
        # far: 30 days from issued_at (June 15 → July 15), within tolerance but farther
        {"provider": "google", "month": "2026-07", "amount_usd": 1000.0,
         "wise_ref": "w-far", "paid_at": "2026-07-15"},
    ]
    rows = gaps.run(
        invoices, payments, steady_pools,
        ["2026-06"], CFG, today="2026-08-10",
    )
    r = next(x for x in rows if x["provider"] == "google")
    assert r["status"] == "ok"
    assert "w-close" in r["payment_refs"], (
        f"expected w-close to be selected, payment_refs={r['payment_refs']!r}"
    )
    assert "w-far" not in r["payment_refs"], (
        f"w-far should NOT be selected, payment_refs={r['payment_refs']!r}"
    )
