"""Hermetic tests for operator overrides.

- burn.grants() override precedence: live balance > override (manual) > credits.json hc
- run.load_overrides(): overrides datasource rows → {(scope, key, field): value} dict

No I/O, no network, no SOPS.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import burn
import ingest.run as _run

TODAY = "2026-07-03"

_POOL = {
    "pool": "Lambda",
    "providers": ["lambda"],
    "billing": "prepaid",
    "kind": "grant",
    "granted": 5552.0,
    "left": 5552.0,
    "cash_left": None,
    "expires": "",
    "note": "",
}


# ---------------------------------------------------------------------------
# grants() override precedence
# ---------------------------------------------------------------------------

def test_grants_override_beats_hc():
    """An operator override supersedes the credits.json hc value (src 'manual')."""
    overrides = {("grants", "Lambda", "left_usd"): 1500.0}
    rows = burn.grants([_POOL], [], TODAY, overrides)
    assert len(rows) == 1
    g = rows[0]
    assert g["left_usd"] == 1500.0
    assert g["left_src"] == "manual"
    # Fields without an override keep the hc value/src
    assert g["granted_usd"] == 5552.0
    assert g["granted_src"] == "hc"


def test_grants_live_balance_beats_override():
    """A live balance snapshot supersedes the operator override (src 'api')."""
    overrides = {("grants", "Lambda", "left_usd"): 1500.0}
    balances = [
        {"run_at": "2026-07-02 12:00:00", "provider": "lambda",
         "granted_usd": None, "spent_usd": None, "left_usd": 1200.0,
         "prepaid_left_usd": None, "source": "api", "note": ""},
    ]
    rows = burn.grants([_POOL], balances, TODAY, overrides)
    g = rows[0]
    assert g["left_usd"] == 1200.0
    assert g["left_src"] == "api"
    # granted has no live value → the hc value survives (no override for it)
    assert g["granted_usd"] == 5552.0
    assert g["granted_src"] == "hc"


def test_grants_override_per_field_independent():
    """Overrides apply per field: an overridden granted_usd coexists with a
    live-overlaid left_usd."""
    overrides = {("grants", "Lambda", "granted_usd"): 6000.0}
    balances = [
        {"run_at": "2026-07-02 12:00:00", "provider": "lambda",
         "granted_usd": None, "spent_usd": None, "left_usd": 1200.0,
         "prepaid_left_usd": None, "source": "api", "note": ""},
    ]
    rows = burn.grants([_POOL], balances, TODAY, overrides)
    g = rows[0]
    assert g["granted_usd"] == 6000.0
    assert g["granted_src"] == "manual"
    assert g["left_usd"] == 1200.0
    assert g["left_src"] == "api"


def test_grants_no_overrides_arg_defaults_to_hc():
    """grants() without overrides behaves exactly as before (hc fallback)."""
    rows = burn.grants([_POOL], [], TODAY)
    g = rows[0]
    assert g["left_usd"] == 5552.0
    assert g["left_src"] == "hc"


# ---------------------------------------------------------------------------
# run.load_overrides()
# ---------------------------------------------------------------------------

class _OpsStub:
    """TB stub whose sql() returns canned overrides rows."""

    def __init__(self, rows):
        self._rows = rows
        self.queries = []

    def sql(self, query):
        self.queries.append(query)
        return self._rows


def test_load_overrides_builds_keyed_dict():
    stub = _OpsStub([
        {"scope": "grants", "key": "Lambda", "field": "left_usd",
         "value_num": 1500.0, "value_str": ""},
    ])
    result = _run.load_overrides(stub)
    assert result == {("grants", "Lambda", "left_usd"): 1500.0}
    assert any("overrides" in q for q in stub.queries)


def test_load_overrides_value_str_when_value_num_none():
    """value_str is used when value_num is None (e.g. reconciliation accepts)."""
    stub = _OpsStub([
        {"scope": "grants", "key": "Lambda", "field": "left_usd",
         "value_num": 1500.0, "value_str": ""},
        {"scope": "reconciliation", "key": "2026-06:google", "field": "accepted",
         "value_num": None, "value_str": "yes"},
    ])
    result = _run.load_overrides(stub)
    assert result[("grants", "Lambda", "left_usd")] == 1500.0
    assert result[("reconciliation", "2026-06:google", "accepted")] == "yes"


def test_load_overrides_empty_table():
    result = _run.load_overrides(_OpsStub([]))
    assert result == {}
