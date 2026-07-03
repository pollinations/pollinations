"""Operator counterparty rules re-stamp payments (run.apply_payment_rules).

Run: cd apps/operation/forager && python3 -m pytest tests/test_payment_rules.py -v
"""
from ingest.run import apply_payment_rules

SLUG_CAT = {"vast.ai": "compute", "anthropic": "compute"}


def test_restamps_provider_and_category():
    rows = [
        {"counterparty": "NVIDIA CORP", "provider": "", "category": "unmatched",
         "amount_eur": 5000.0},
        {"counterparty": "Anthropic", "provider": "anthropic",
         "category": "compute", "amount_eur": 100.0},
    ]
    overrides = {("payments", "NVIDIA CORP", "provider"): "vast.ai"}

    assert apply_payment_rules(rows, overrides, SLUG_CAT) == 1
    assert rows[0]["provider"] == "vast.ai"
    assert rows[0]["category"] == "compute"
    assert rows[1]["provider"] == "anthropic"


def test_idempotent_second_pass():
    rows = [{"counterparty": "NVIDIA CORP", "provider": "vast.ai",
             "category": "compute"}]
    overrides = {("payments", "NVIDIA CORP", "provider"): "vast.ai"}

    assert apply_payment_rules(rows, overrides, SLUG_CAT) == 0


def test_ignores_other_scopes_and_empty_values():
    rows = [{"counterparty": "X", "provider": "", "category": "unmatched"}]
    overrides = {
        ("grants", "pool", "left_usd"): 5,
        ("payments", "X", "provider"): "",
    }

    assert apply_payment_rules(rows, overrides, SLUG_CAT) == 0
    assert rows[0]["provider"] == ""


def test_unknown_slug_falls_back_to_compute():
    rows = [{"counterparty": "Y GMBH", "provider": "", "category": "unmatched"}]
    overrides = {("payments", "Y GMBH", "provider"): "newprovider"}

    assert apply_payment_rules(rows, overrides, SLUG_CAT) == 1
    assert rows[0]["category"] == "compute"
