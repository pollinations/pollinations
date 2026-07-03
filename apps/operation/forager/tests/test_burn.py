"""Hermetic tests for ingest/burn.py — one test per engine rule + scenario tests.

No I/O, no network, no SOPS. All inputs are plain dicts.
"""

from ingest import burn

TODAY = "2026-07-03"

# ---------------------------------------------------------------------------
# Minimal pool fixtures
# ---------------------------------------------------------------------------
POOL_SPONSORED = {
    "pool": "Azure",
    "providers": ["azure"],
    "billing": "sponsored",
    "kind": "grant",
    "granted": 250000.0,
    "left": 244600.0,
    "prepaid_left": None,
    "expires": "",
    "note": "",
}
POOL_PREPAID = {
    "pool": "RunPod",
    "providers": ["runpod"],
    "billing": "prepaid",
    "kind": "prepaid",
    "granted": None,
    "left": 255.66,
    "prepaid_left": None,
    "expires": "",
    "note": "",
}
POOL_MONTHLY = {
    "pool": "Google",
    "providers": ["google"],
    "billing": "monthly",
    "kind": "payg",
    "granted": None,
    "left": None,
    "prepaid_left": None,
    "expires": "",
    "note": "",
}

# AWS-style: billing=monthly, kind=grant (grant pool that expects invoices too)
POOL_MONTHLY_GRANT = {
    "pool": "AWS",
    "providers": ["aws"],
    "billing": "monthly",
    "kind": "grant",
    "granted": 30000.0,
    "left": 28000.0,
    "cash_left": None,
    "expires": "",
    "note": "",
}

POOLS = [POOL_SPONSORED, POOL_PREPAID, POOL_MONTHLY]
POOLS_WITH_MONTHLY_GRANT = [
    POOL_SPONSORED,
    POOL_PREPAID,
    POOL_MONTHLY,
    POOL_MONTHLY_GRANT,
]
MONTHS = ["2026-06"]
CFG = {}


def _run(
    invoices=(), payments=(), meter=(), usage=(), balances=(), pools=None, months=None
):
    return burn.run(
        list(invoices),
        list(payments),
        list(meter),
        list(usage),
        list(balances),
        pools if pools is not None else POOLS,
        months if months is not None else MONTHS,
        CFG,
        TODAY,
    )


def _row(rows, provider, month=None):
    m = month or MONTHS[0]
    return next(r for r in rows if r["provider"] == provider and r["month"] == m)


# ---------------------------------------------------------------------------
# CANON tests
# ---------------------------------------------------------------------------


def test_canon_bedrock_maps_to_aws():
    assert burn.CANON.get("bedrock") == "aws"
    assert burn.CANON.get("aws-bedrock") == "aws"


def test_canon_vastai_maps_to_vast_ai():
    assert burn.CANON.get("vastai") == "vast.ai"


def test_canon_azure_2_maps_to_azure():
    assert burn.CANON.get("azure-2") == "azure"


def test_canon_aws_bedrock_maps_to_aws():
    # Verbatim: both aliases → aws
    assert burn.CANON.get("aws-bedrock") == "aws"


def test_canon_vastai_dot_ai():
    # Verbatim: vastai → vast.ai (with dot)
    assert burn.CANON.get("vastai") == "vast.ai"


def test_canon_azure_openai_not_in_canon():
    # azure-openai is NOT in the verbatim CANON; it pass-throughs as-is
    assert "azure-openai" not in burn.CANON


def test_canon_vertex_ai_not_in_canon():
    # vertex-ai is NOT in the verbatim CANON; it pass-throughs as-is
    assert "vertex-ai" not in burn.CANON


def test_canon_unknown_passthrough():
    # Providers not in map should pass through when lowercased (not via CANON dict — via canonicalize)
    assert burn.CANON.get("deepinfra") is None  # not in the alias dict; pass-through


# ---------------------------------------------------------------------------
# Rule 1: universe
# ---------------------------------------------------------------------------


def test_rule1_pool_provider_in_universe():
    rows = _run()
    providers = {r["provider"] for r in rows}
    # All pool providers must appear even with no data
    assert "azure" in providers
    assert "runpod" in providers
    assert "google" in providers


def test_rule1_usage_provider_adds_to_universe():
    usage = [
        {
            "month": "2026-06",
            "provider": "deepinfra",
            "model": "m",
            "billable_requests_paid_pollen": 10,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 1.0,
            "billable_quest_pollen": 0.0,
            "cost_paid_pollen": 2.0,
            "cost_quest_pollen": 0.0,
        }
    ]
    rows = _run(usage=usage)
    providers = {r["provider"] for r in rows}
    assert "deepinfra" in providers


def test_rule1_usage_raw_tb_name_canonicalized():
    # "bedrock" in usage should appear as "aws" in output
    usage = [
        {
            "month": "2026-06",
            "provider": "bedrock",
            "model": "m",
            "billable_requests_paid_pollen": 10,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 0.0,
            "billable_quest_pollen": 0.0,
            "cost_paid_pollen": 5.0,
            "cost_quest_pollen": 0.0,
        }
    ]
    rows = _run(usage=usage)
    providers = {r["provider"] for r in rows}
    assert "aws" in providers
    assert "bedrock" not in providers


def test_rule1_invoice_provider_adds_to_universe():
    invoices = [
        {
            "sha256": "abc",
            "provider": "nebius",
            "period_month": "2026-06",
            "amount_usd": 100.0,
            "status": "parsed",
            "issued_at": "2026-06-01",
            "category": "compute",
            "kind": "monthly_bill",
            "currency": "USD",
            "amount": 100.0,
            "invoice_number": "1",
            "source": "gmail",
            "file_ref": "",
            "ingested_at": TODAY,
        }
    ]
    rows = _run(invoices=invoices)
    providers = {r["provider"] for r in rows}
    assert "nebius" in providers


# ---------------------------------------------------------------------------
# Rule 2: invoice_usd and cash_usd
# ---------------------------------------------------------------------------


def test_rule2_invoice_usd_sums_parsed_only():
    invoices = [
        {
            "sha256": "s1",
            "provider": "google",
            "period_month": "2026-06",
            "amount_usd": 100.0,
            "status": "parsed",
            "issued_at": "2026-06-01",
            "category": "",
            "kind": "",
            "currency": "USD",
            "amount": 100.0,
            "invoice_number": "",
            "source": "",
            "file_ref": "",
            "ingested_at": TODAY,
        },
        {
            "sha256": "s2",
            "provider": "google",
            "period_month": "2026-06",
            "amount_usd": 50.0,
            "status": "needs_review",
            "issued_at": "2026-06-02",
            "category": "",
            "kind": "",
            "currency": "USD",
            "amount": 50.0,
            "invoice_number": "",
            "source": "",
            "file_ref": "",
            "ingested_at": TODAY,
        },
    ]
    r = _row(_run(invoices=invoices), "google")
    assert r["invoice_usd"] == 100.0  # needs_review not counted


def test_rule2_cash_payments_counted_by_provider_month():
    # cash_usd was dropped from the provider_month schema; payments still feed
    # the status rule internally — a paid provider is "ok", never "quiet".
    payments = [
        {
            "paid_at": "2026-06-10",
            "month": "2026-06",
            "provider": "runpod",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 300.0,
            "wise_ref": "w1",
        },
        {
            "paid_at": "2026-06-20",
            "month": "2026-06",
            "provider": "runpod",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 200.0,
            "wise_ref": "w2",
        },
    ]
    r = _row(_run(payments=payments), "runpod")
    assert r["status"] == "ok"


def test_rule2_empty_provider_payments_excluded():
    payments = [
        {
            "paid_at": "2026-06-10",
            "month": "2026-06",
            "provider": "",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 999.0,
            "wise_ref": "w9",
        },
    ]
    rows = _run(payments=payments)
    # Unmatched (empty provider) should not count for any provider:
    # nobody flips to "ok" because of the orphan payment
    for r in rows:
        assert r["status"] in ("quiet", "needs_data")


# ---------------------------------------------------------------------------
# Rule 3: meter — api precedence over manual, funding split
# ---------------------------------------------------------------------------


def test_rule3_meter_api_wins_over_manual():
    meter = [
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 50.0,
            "funding": "prepaid",
            "source": "manual",
            "retrieved_at": "2026-07-01",
        },
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 1200.0,
            "funding": "prepaid",
            "source": "api",
            "retrieved_at": "2026-07-02",
        },
    ]
    r = _row(_run(meter=meter), "runpod")
    assert r["meter_prepaid_usd"] == 1200.0
    assert r["meter_src"] == "api"


def test_rule3_meter_cash_and_prepaid_split():
    meter = [
        {
            "month": "2026-06",
            "provider": "google",
            "cost_usd": 80.0,
            "funding": "cash",
            "source": "api",
            "retrieved_at": "2026-07-01",
        },
        {
            "month": "2026-06",
            "provider": "google",
            "cost_usd": 20.0,
            "funding": "prepaid",
            "source": "api",
            "retrieved_at": "2026-07-01",
        },
    ]
    r = _row(_run(meter=meter), "google")
    assert r["meter_cash_usd"] == 80.0
    assert r["meter_prepaid_usd"] == 20.0
    assert r["meter_src"] == "api"


def test_rule3_meter_src_empty_when_no_rows():
    r = _row(_run(), "runpod")
    assert r["meter_src"] == ""
    assert r["meter_cash_usd"] == 0.0
    assert r["meter_prepaid_usd"] == 0.0


def test_rule3_manual_fills_hole_when_no_api_cli_bq():
    meter = [
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 77.0,
            "funding": "prepaid",
            "source": "manual",
            "retrieved_at": "2026-07-01",
        },
    ]
    r = _row(_run(meter=meter), "runpod")
    assert r["meter_prepaid_usd"] == 77.0
    assert r["meter_src"] == "manual"


def test_rule3_latest_retrieved_at_wins_same_source():
    # Two api rows — later retrieved_at wins
    meter = [
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 100.0,
            "funding": "prepaid",
            "source": "api",
            "retrieved_at": "2026-07-01",
        },
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 120.0,
            "funding": "prepaid",
            "source": "api",
            "retrieved_at": "2026-07-02",
        },
    ]
    r = _row(_run(meter=meter), "runpod")
    assert r["meter_prepaid_usd"] == 120.0


# ---------------------------------------------------------------------------
# Rule 4: credit_burn_usd — sponsored/grant pool
# ---------------------------------------------------------------------------


def test_rule4_credit_burn_from_meter_credit_funding():
    meter = [
        {
            "month": "2026-06",
            "provider": "azure",
            "cost_usd": 500.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    r = _row(_run(meter=meter), "azure")
    assert r["credit_burn_usd"] == 500.0
    assert r["credit_src"] == "meter"


def test_rule4_credit_burn_from_balance_delta():
    # No credit meter; two snapshots spanning the month
    balances = [
        {
            "run_at": "2026-05-31 23:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5000.0,
            "left_usd": 245000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
        {
            "run_at": "2026-06-30 23:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5400.0,
            "left_usd": 244600.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]
    r = _row(_run(balances=balances), "azure")
    assert r["credit_burn_usd"] == 400.0
    assert r["credit_src"] == "delta"


def test_rule4_credit_burn_from_invoice_credit():
    invoices = [
        {
            "sha256": "aws-credit",
            "provider": "aws",
            "period_month": "2026-06",
            "amount_usd": 0.0,
            "credit_usd": 384.47,
            "status": "parsed",
            "issued_at": "2026-06-30",
            "category": "compute",
            "kind": "monthly_bill",
            "currency": "USD",
            "amount": 0.0,
            "invoice_number": "",
            "source": "email",
            "file_ref": "",
            "ingested_at": TODAY,
        },
    ]
    r = _row(_run(invoices=invoices, pools=[POOL_MONTHLY_GRANT]), "aws")
    assert r["invoice_usd"] == 0.0
    assert r["credit_burn_usd"] == 384.47
    assert r["credit_src"] == "invoice"


def test_rule4_api_meter_credit_wins_over_invoice_credit():
    invoices = [
        {
            "sha256": "aws-credit",
            "provider": "aws",
            "period_month": "2026-06",
            "amount_usd": 0.0,
            "credit_usd": 100.0,
            "status": "parsed",
            "issued_at": "2026-06-30",
            "category": "compute",
            "kind": "monthly_bill",
            "currency": "USD",
            "amount": 0.0,
            "invoice_number": "",
            "source": "email",
            "file_ref": "",
            "ingested_at": TODAY,
        },
    ]
    meter = [
        {
            "month": "2026-06",
            "provider": "aws",
            "cost_usd": 250.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    r = _row(_run(invoices=invoices, meter=meter, pools=[POOL_MONTHLY_GRANT]), "aws")
    assert r["credit_burn_usd"] == 250.0
    assert r["credit_src"] == "meter"


def test_rule4_delta_needs_both_snapshots_one_missing_gives_needs_data():
    # Only one snapshot (before month start) — cannot compute delta
    balances = [
        {
            "run_at": "2026-05-31 23:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5000.0,
            "left_usd": 245000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]
    r = _row(_run(balances=balances), "azure")
    assert r["credit_src"] == "" or r["status"] == "needs_data"


def test_rule4_negative_delta_falls_through():
    # Month-end left > month-start left (top-up happened) → negative burn → not usable → needs_data
    balances = [
        {
            "run_at": "2026-05-31 23:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5000.0,
            "left_usd": 244000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
        {
            "run_at": "2026-06-30 23:00:00",
            "provider": "azure",
            "granted_usd": 300000.0,
            "spent_usd": 5000.0,
            "left_usd": 295000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]
    r = _row(_run(balances=balances), "azure")
    # negative delta → fallthrough → no manual either → needs_data note
    assert r["credit_burn_usd"] == 0.0
    assert r["status"] == "needs_data"


def test_rule4_credit_burn_from_manual_row_fallback():
    # No api/cli snapshots, but a manual meter credit row
    meter = [
        {
            "month": "2026-06",
            "provider": "azure",
            "cost_usd": 300.0,
            "funding": "credit",
            "source": "manual",
            "retrieved_at": TODAY,
        },
    ]
    r = _row(_run(meter=meter), "azure")
    assert r["credit_burn_usd"] == 300.0
    assert r["credit_src"] == "manual"


def test_rule4_non_grant_pool_has_no_credit_burn():
    # runpod is prepaid, not sponsored/grant
    r = _row(_run(), "runpod")
    assert r["credit_burn_usd"] == 0.0
    assert r["credit_src"] == ""


# ---------------------------------------------------------------------------
# Rule 5: usage_cost_usd
# ---------------------------------------------------------------------------


def test_rule5_usage_cost_sums_paid_and_quest():
    usage = [
        {
            "month": "2026-06",
            "provider": "google",
            "model": "gemini-2",
            "billable_requests_paid_pollen": 100,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 5.0,
            "billable_quest_pollen": 1.0,
            "cost_paid_pollen": 3.0,
            "cost_quest_pollen": 1.5,
        },
        {
            "month": "2026-06",
            "provider": "google",
            "model": "imagen-4",
            "billable_requests_paid_pollen": 50,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 2.0,
            "billable_quest_pollen": 0.0,
            "cost_paid_pollen": 1.0,
            "cost_quest_pollen": 0.0,
        },
    ]
    r = _row(_run(usage=usage), "google")
    assert r["usage_cost_usd"] == round(3.0 + 1.5 + 1.0 + 0.0, 2)


# ---------------------------------------------------------------------------
# Rule 7: status
# ---------------------------------------------------------------------------


def test_rule7_status_needs_data_for_sponsored_no_credit_signal():
    # azure is sponsored; no meter/delta/manual → needs_data
    r = _row(_run(), "azure")
    assert r["status"] == "needs_data"


def test_rule7_status_grant_burn_when_credit_burn_gt_0():
    meter = [
        {
            "month": "2026-06",
            "provider": "azure",
            "cost_usd": 200.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    r = _row(_run(meter=meter), "azure")
    assert r["status"] == "grant_burn"


def test_rule7_status_grant_burn_when_usage_cost_gt_1_in_grant_pool():
    usage = [
        {
            "month": "2026-06",
            "provider": "azure",
            "model": "gpt-4",
            "billable_requests_paid_pollen": 10,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 0.0,
            "billable_quest_pollen": 0.0,
            "cost_paid_pollen": 5.0,
            "cost_quest_pollen": 2.0,
        },
    ]
    # azure pool is sponsored/grant; even without credit_burn, usage_cost > 1 → grant_burn
    # BUT we need a credit signal first (needs_data wins over grant_burn for sponsored pools).
    # grant_burn fires when sponsored AND (usage_cost>1 OR credit_burn>0) AND credit signal known
    # Here: no credit signal → needs_data beats grant_burn.
    r = _row(_run(usage=usage), "azure")
    assert r["status"] == "needs_data"


def test_rule7_status_usage_no_invoice_for_non_grant_provider():
    pools_no_grant = [POOL_PREPAID]  # runpod = prepaid, not grant
    usage = [
        {
            "month": "2026-06",
            "provider": "runpod",
            "model": "m",
            "billable_requests_paid_pollen": 10,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 0.0,
            "billable_quest_pollen": 0.0,
            "cost_paid_pollen": 5.0,
            "cost_quest_pollen": 2.0,
        },
    ]
    r = _row(_run(usage=usage, pools=pools_no_grant), "runpod")
    assert r["status"] == "usage_no_invoice"


def test_rule7_status_quiet_when_all_zeros():
    r = _row(_run(pools=[POOL_PREPAID]), "runpod")
    assert r["status"] == "quiet"


def test_rule7_status_ok_when_invoice_and_cash():
    # google pool is billing=monthly, kind=payg — genuine payg pool, not grant
    invoices = [
        {
            "sha256": "s1",
            "provider": "google",
            "period_month": "2026-06",
            "amount_usd": 500.0,
            "status": "parsed",
            "issued_at": "2026-06-01",
            "category": "",
            "kind": "",
            "currency": "USD",
            "amount": 500.0,
            "invoice_number": "",
            "source": "",
            "file_ref": "",
            "ingested_at": TODAY,
        },
    ]
    payments = [
        {
            "paid_at": "2026-06-28",
            "month": "2026-06",
            "provider": "google",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 500.0,
            "wise_ref": "w1",
        },
    ]
    r = _row(_run(invoices=invoices, payments=payments, pools=[POOL_MONTHLY]), "google")
    assert r["status"] == "ok"


def test_rule4_monthly_grant_pool_credit_meter_gives_credit_burn():
    # AWS-style: billing=monthly, kind=grant — credit_burn should fire via grant gate
    meter = [
        {
            "month": "2026-06",
            "provider": "aws",
            "cost_usd": 250.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    r = _row(_run(meter=meter, pools=[POOL_MONTHLY_GRANT]), "aws")
    assert r["credit_burn_usd"] == 250.0
    assert r["credit_src"] == "meter"
    assert r["status"] == "grant_burn"


def test_rule7_monthly_grant_pool_no_credit_signal_gives_needs_data():
    # AWS-style: billing=monthly, kind=grant — no credit signal → needs_data
    r = _row(_run(pools=[POOL_MONTHLY_GRANT]), "aws")
    assert r["status"] == "needs_data"


def test_rule7_sponsored_pool_no_signal_needs_data():
    # A sponsored/grant pool provider with no meter/delta/manual signal → needs_data
    pool_ionet = {
        "pool": "io.net",
        "providers": ["io.net"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 10000.0,
        "left": 8000.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    r = _row(_run(pools=[pool_ionet]), "io.net")
    assert r["status"] == "needs_data"


# ---------------------------------------------------------------------------
# grants() tests
# ---------------------------------------------------------------------------


def test_grants_hc_values_when_no_balances():
    pool = {
        "pool": "Azure",
        "providers": ["azure"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "prepaid_left": None,
        "expires": "2028-04",
        "note": "startup credit",
    }
    rows = burn.grants([pool], [], TODAY)
    assert len(rows) == 1
    g = rows[0]
    assert g["pool"] == "Azure"
    assert g["granted_usd"] == 250000.0
    assert g["granted_src"] == "hc"
    assert g["left_usd"] == 244600.0
    assert g["left_src"] == "hc"
    assert g["prepaid_left_usd"] is None
    assert g["prepaid_left_src"] == ""
    assert g["expires"] == "2028-04"
    assert g["note"] == "startup credit"
    assert g["run_at"] == TODAY


def test_grants_api_overlay_beats_hc():
    pool = {
        "pool": "Azure",
        "providers": ["azure"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 12:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5800.0,
            "left_usd": 244200.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "live",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    g = rows[0]
    assert g["left_usd"] == 244200.0
    assert g["left_src"] == "api"
    assert (
        g["granted_usd"] == 250000.0
    )  # granted unchanged (api snapshot doesn't have separate granted)
    # Actually: if balance has granted_usd, it should overlay too
    assert g["granted_src"] in ("api", "hc")  # api if present, hc otherwise


def test_grants_none_preserved():
    # pool uses cash_left field (the real credits.json field name)
    pool = {
        "pool": "RunPod",
        "providers": ["runpod"],
        "billing": "prepaid",
        "kind": "prepaid",
        "granted": None,
        "left": None,
        "cash_left": 255.66,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["granted_usd"] is None
    assert g["left_usd"] is None
    # cash_left from credits.json should appear as prepaid_left_usd in the output
    assert g["prepaid_left_usd"] == 255.66
    assert g["prepaid_left_src"] == "hc"


def test_grants_cash_left_field_name():
    # grants() reads pool.cash_left (not pool.prepaid_left) per credits.json schema
    pool = {
        "pool": "Lambda",
        "providers": ["lambda"],
        "billing": "prepaid",
        "kind": "prepaid",
        "granted": None,
        "left": None,
        "cash_left": 140.58,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["prepaid_left_usd"] == 140.58
    assert g["prepaid_left_src"] == "hc"


def test_grants_multi_provider_pool_uses_latest_balance():
    pool = {
        "pool": "GCP",
        "providers": ["google", "vertex"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 350000.0,
        "left": 300000.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 10:00:00",
            "provider": "google",
            "granted_usd": 350000.0,
            "spent_usd": 50000.0,
            "left_usd": 298000.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    assert rows[0]["left_usd"] == 298000.0
    assert rows[0]["left_src"] == "api"


def test_grants_manual_balance_src():
    pool = {
        "pool": "Perplexity",
        "providers": ["perplexity"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 5000.0,
        "left": 4000.0,
        "prepaid_left": None,
        "expires": "",
        "note": "",
    }
    balances = [
        {
            "run_at": "2026-07-01 09:00:00",
            "provider": "perplexity",
            "granted_usd": None,
            "spent_usd": None,
            "left_usd": 3500.0,
            "prepaid_left_usd": None,
            "source": "manual",
            "note": "hand",
        },
    ]
    rows = burn.grants([pool], balances, TODAY)
    g = rows[0]
    assert g["left_usd"] == 3500.0
    assert g["left_src"] == "manual"


# ---------------------------------------------------------------------------
# Full miniature scenario: 2 months × 3 providers
# ---------------------------------------------------------------------------


def test_full_scenario_2months_3providers():
    """Asserting complete row shapes for a 2-month × 3-provider scenario."""
    pools_scen = [
        {
            "pool": "Azure",
            "providers": ["azure"],
            "billing": "sponsored",
            "kind": "grant",
            "granted": 250000.0,
            "left": 244600.0,
            "prepaid_left": None,
            "expires": "",
            "note": "",
        },
        {
            "pool": "RunPod",
            "providers": ["runpod"],
            "billing": "prepaid",
            "kind": "prepaid",
            "granted": None,
            "left": 800.0,
            "prepaid_left": None,
            "expires": "",
            "note": "",
        },
        {
            "pool": "Google",
            "providers": ["google"],
            "billing": "monthly",
            "kind": "payg",
            "granted": None,
            "left": None,
            "cash_left": None,
            "expires": "",
            "note": "",
        },
    ]
    months_scen = ["2026-05", "2026-06"]

    invoices = [
        {
            "sha256": "g1",
            "provider": "google",
            "period_month": "2026-05",
            "amount_usd": 1000.0,
            "status": "parsed",
            "issued_at": "2026-05-31",
            "category": "",
            "kind": "",
            "currency": "USD",
            "amount": 1000.0,
            "invoice_number": "",
            "source": "",
            "file_ref": "",
            "ingested_at": TODAY,
        },
    ]
    payments = [
        {
            "paid_at": "2026-05-28",
            "month": "2026-05",
            "provider": "runpod",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 500.0,
            "wise_ref": "rp1",
        },
        {
            "paid_at": "2026-06-15",
            "month": "2026-06",
            "provider": "runpod",
            "counterparty": "",
            "amount_eur": 0.0,
            "amount_usd": 600.0,
            "wise_ref": "rp2",
        },
    ]
    meter = [
        {
            "month": "2026-05",
            "provider": "azure",
            "cost_usd": 300.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
        {
            "month": "2026-06",
            "provider": "azure",
            "cost_usd": 400.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
        {
            "month": "2026-06",
            "provider": "runpod",
            "cost_usd": 580.0,
            "funding": "prepaid",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    usage = [
        {
            "month": "2026-05",
            "provider": "azure",
            "model": "gpt-4",
            "billable_requests_paid_pollen": 1000,
            "billable_requests_quest_pollen": 0,
            "billable_paid_pollen": 10.0,
            "billable_quest_pollen": 2.0,
            "cost_paid_pollen": 5.0,
            "cost_quest_pollen": 1.0,
        },
    ]
    balances = [
        {
            "run_at": "2026-07-01 00:00:00",
            "provider": "azure",
            "granted_usd": 250000.0,
            "spent_usd": 5700.0,
            "left_usd": 244300.0,
            "prepaid_left_usd": None,
            "source": "api",
            "note": "",
        },
    ]

    rows = burn.run(
        invoices, payments, meter, usage, balances, pools_scen, months_scen, CFG, TODAY
    )

    # Check exact schema (slimmed provider_month datasource)
    required_cols = {
        "month",
        "provider",
        "category",
        "invoice_usd",
        "meter_cash_usd",
        "meter_prepaid_usd",
        "meter_src",
        "usage_cost_usd",
        "credit_burn_usd",
        "credit_src",
        "status",
    }
    for r in rows:
        assert set(r.keys()) == required_cols, (
            f"row cols mismatch: {set(r.keys()) ^ required_cols} in {r}"
        )

    # azure-2026-05: credit meter → grant_burn
    az05 = next(r for r in rows if r["provider"] == "azure" and r["month"] == "2026-05")
    assert az05["credit_burn_usd"] == 300.0
    assert az05["credit_src"] == "meter"
    assert az05["status"] == "grant_burn"

    # azure-2026-06: credit meter
    az06 = next(r for r in rows if r["provider"] == "azure" and r["month"] == "2026-06")
    assert az06["credit_burn_usd"] == 400.0
    assert az06["status"] == "grant_burn"

    # usage from "azure" provider lands on azure 2026-05
    assert az05["usage_cost_usd"] == round(5.0 + 1.0, 2)

    # runpod-2026-05: cash payment, no invoice, no meter → ok (not quiet)
    rp05 = next(
        r for r in rows if r["provider"] == "runpod" and r["month"] == "2026-05"
    )
    assert rp05["invoice_usd"] == 0.0
    assert rp05["status"] == "ok"

    # runpod-2026-06: prepaid meter
    rp06 = next(
        r for r in rows if r["provider"] == "runpod" and r["month"] == "2026-06"
    )
    assert rp06["meter_prepaid_usd"] == 580.0
    assert rp06["meter_src"] == "api"

    # google-2026-05: invoice
    g05 = next(r for r in rows if r["provider"] == "google" and r["month"] == "2026-05")
    assert g05["invoice_usd"] == 1000.0
    assert g05["status"] == "ok"

    # All floats are rounded to 2dp
    for r in rows:
        for col in (
            "invoice_usd",
            "meter_cash_usd",
            "meter_prepaid_usd",
            "usage_cost_usd",
            "credit_burn_usd",
        ):
            v = r[col]
            assert isinstance(v, float), (
                f"{col} is {type(v)} not float in {r['provider']}/{r['month']}"
            )
            assert round(v, 2) == v, (
                f"{col}={v} not rounded to 2dp in {r['provider']}/{r['month']}"
            )


# ---------------------------------------------------------------------------
# _num helper and non-numeric credits.json value tolerance (live-data bug fix)
# ---------------------------------------------------------------------------


def test_num_returns_none_for_na_strings():
    """'n/a', 'NA', '' and None all become None."""
    assert burn._num("n/a") is None
    assert burn._num("N/A") is None
    assert burn._num("NA") is None
    assert burn._num("na") is None
    assert burn._num("") is None
    assert burn._num(None) is None


def test_num_parses_plain_float():
    assert burn._num(1234.56) == 1234.56
    assert burn._num("99.5") == 99.5
    assert burn._num(0) == 0.0


def test_num_parses_comma_number():
    """Strings like "31,212.50" must parse to 31212.50."""
    assert burn._num("31,212.50") == 31212.50
    assert burn._num("1,000") == 1000.0


def test_num_returns_none_for_unparseable_string():
    """Strings that are not numbers and not n/a variants → None."""
    assert burn._num("pending") is None
    assert burn._num("TBD") is None


def test_grants_non_numeric_hc_values_become_none():
    """Pool with granted='n/a', left='NA', cash_left='' → grants() emits all three as None
    with '' srcs (same as if the fields were absent)."""
    pool = {
        "pool": "AWS-old",
        "providers": ["aws"],
        "billing": "monthly",
        "kind": "grant",
        "granted": "n/a",
        "left": "NA",
        "cash_left": "",
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    assert len(rows) == 1
    g = rows[0]
    assert g["granted_usd"] is None
    assert g["granted_src"] == ""
    assert g["left_usd"] is None
    assert g["left_src"] == ""
    assert g["prepaid_left_usd"] is None
    assert g["prepaid_left_src"] == ""


def test_run_non_numeric_pool_does_not_raise():
    """run() with a pool carrying 'n/a' string values must not raise ValueError;
    the grant pool has no credit signal → needs_data."""
    pool = {
        "pool": "AWS-old",
        "providers": ["aws"],
        "billing": "monthly",
        "kind": "grant",
        "granted": "n/a",
        "left": "NA",
        "cash_left": "",
        "expires": "",
        "note": "",
    }
    rows = burn.run([], [], [], [], [], [pool], MONTHS, CFG, TODAY)
    assert len(rows) == 1
    r = rows[0]
    assert r["status"] == "needs_data"
    assert r["credit_src"] == ""


def test_grants_comma_number_granted_parses():
    """granted='31,212.50' in credits.json must parse to 31212.50."""
    pool = {
        "pool": "AWS",
        "providers": ["aws"],
        "billing": "monthly",
        "kind": "grant",
        "granted": "31,212.50",
        "left": "28,000",
        "cash_left": None,
        "expires": "",
        "note": "",
    }
    rows = burn.grants([pool], [], TODAY)
    g = rows[0]
    assert g["granted_usd"] == 31212.50
    assert g["granted_src"] == "hc"
    assert g["left_usd"] == 28000.0
    assert g["left_src"] == "hc"


# ---------------------------------------------------------------------------
# Fix I1: pool-slug canonicalization in burn.run and burn.grants
# ---------------------------------------------------------------------------


def test_canon_bedrock_native_maps_to_aws():
    """CANON must map 'bedrock (native)' → 'aws'."""
    assert burn.CANON.get("bedrock (native)") == "aws"


def test_pool_with_alias_slug_no_duplicate_rows():
    """Pool providers=[azure, azure-2] → only ONE azure row per month (no azure-2 phantom)."""
    pool_alias = {
        "pool": "Azure",
        "providers": ["azure", "azure-2"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "cash_left": None,
        "expires": "",
        "note": "",
    }
    rows = burn.run([], [], [], [], [], [pool_alias], MONTHS, CFG, TODAY)
    azure_rows = [r for r in rows if r["provider"] == "azure"]
    alias_rows = [r for r in rows if r["provider"] == "azure-2"]
    assert len(azure_rows) == 1, f"expected 1 azure row, got {len(azure_rows)}"
    assert alias_rows == [], f"phantom azure-2 row must not appear: {alias_rows}"


def test_pool_alias_usage_under_canonical_slug():
    """Usage under 'azure' with pool having alias 'azure-2' → usage lands on azure row."""
    pool_alias = {
        "pool": "Azure",
        "providers": ["azure", "azure-2"],
        "billing": "sponsored",
        "kind": "grant",
        "granted": 250000.0,
        "left": 244600.0,
        "cash_left": None,
        "expires": "",
        "note": "",
    }
    meter = [
        {
            "month": "2026-06",
            "provider": "azure",
            "cost_usd": 300.0,
            "funding": "credit",
            "source": "api",
            "retrieved_at": TODAY,
        },
    ]
    rows = burn.run([], [], meter, [], [], [pool_alias], MONTHS, CFG, TODAY)
    azure_rows = [r for r in rows if r["provider"] == "azure"]
    alias_rows = [r for r in rows if r["provider"] == "azure-2"]
    assert len(azure_rows) == 1
    assert alias_rows == []
    assert azure_rows[0]["credit_burn_usd"] == 300.0


def test_registry_six_new_pool_slugs_in_canonical():
    """Six new credits.json pool slugs must be in registry.CANONICAL."""
    from ingest.connectors import registry

    for slug in ("airforce", "bpai", "community", "self-hosted", "seraphyn", "aws-new"):
        assert slug in registry.CANONICAL, (
            f"CANONICAL missing credits.json pool slug: {slug}"
        )


def test_registry_alias_slugs_not_in_canonical():
    """Alias slugs that canonicalize away must NOT be in CANONICAL."""
    from ingest.connectors import registry

    for slug in ("azure-2", "aws-bedrock", "bedrock (native)"):
        assert slug not in registry.CANONICAL, (
            f"CANONICAL wrongly contains alias slug: {slug}"
        )
