from ingest import gaps

CFG = {"recon_tolerance_pct": 0.02, "recon_tolerance_usd": 2.0, "recon_accepted": []}
POOLS = [
    {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    {"pool": "RunPod", "providers": ["runpod"], "billing": "prepaid", "active_from": "2026-01"},
    {"pool": "Azure spons", "providers": ["azure"], "billing": "sponsored", "active_from": "2026-01"},
]

def _run(inv=[], pay=[], months=["2026-06"]):
    return gaps.run(inv, pay, POOLS, months, CFG, today="2026-07-02")

def test_monthly_active_window_expects_invoice():
    r = next(x for x in _run() if x["provider"] == "google")     # active, no invoice, no payment
    assert r["status"] == "missing_invoice"

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

def test_needs_label_is_amber_not_ok():
    r = next(x for x in _run(inv=[{"provider": "google", "kind": "monthly_bill",
                                   "period_month": "2026-06", "amount_usd": 0.0,
                                   "sha256": "c3", "status": "needs_label"}])
             if x["provider"] == "google")
    assert r["status"] == "needs_label"

def test_sponsored_is_ok_credit():
    assert next(x for x in _run() if x["provider"] == "azure")["status"] == "ok_credit"
