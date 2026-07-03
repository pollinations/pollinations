"""Hermetic tests for REST balance connectors (B3).

Connectors: openrouter, deepinfra, runpod, scaleway, digitalocean, daytona.
All hermetic — http_json is monkeypatched on each provider module. No network,
no SOPS, no real credentials.

Run: cd apps/operation/forager && python3 -m pytest tests/test_providers_rest.py -q
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest.connectors import registry
import ingest.connectors.providers.openrouter as _or
import ingest.connectors.providers.deepinfra as _di
import ingest.connectors.providers.runpod as _rp
import ingest.connectors.providers.scaleway as _scw
import ingest.connectors.providers.digitalocean as _do
import ingest.connectors.providers.daytona as _dtn


NOW = "2026-07-03 14:05:00"

# ---------------------------------------------------------------------------
# Capture helper — records calls, returns canned JSON
# ---------------------------------------------------------------------------

class Capture:
    """Monkeypatch-friendly http_json replacement that records calls."""
    def __init__(self, responses):
        # responses: list of dicts returned in order per call
        self._responses = list(responses)
        self.calls = []

    def __call__(self, url, headers=None, timeout=30, data=None, method=None):
        self.calls.append({"url": url, "headers": headers or {}, "data": data})
        return self._responses.pop(0)


# ---------------------------------------------------------------------------
# openrouter
# ---------------------------------------------------------------------------

def test_openrouter_balance_row(monkeypatch):
    cap = Capture([{"data": {"total_credits": 3000.0, "total_usage": 1372.48}}])
    monkeypatch.setattr(_or, "http_json", cap)
    row = _or.balance({"OPENROUTER_MANAGEMENT_API_KEY": "test-key"}, NOW)
    assert row["provider"] == "openrouter"
    assert row["granted_usd"] == 3000.0
    assert row["spent_usd"] == 1372.48
    assert row["left_usd"] == 1627.52
    assert row["prepaid_left_usd"] is None
    assert row["source"] == "api"
    assert row["run_at"] == NOW


def test_openrouter_auth_header(monkeypatch):
    cap = Capture([{"data": {"total_credits": 100.0, "total_usage": 10.0}}])
    monkeypatch.setattr(_or, "http_json", cap)
    _or.balance({"OPENROUTER_MANAGEMENT_API_KEY": "sk-or-test"}, NOW)
    assert len(cap.calls) == 1
    assert cap.calls[0]["headers"].get("Authorization") == "Bearer sk-or-test"


def test_openrouter_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _or.balance({}, NOW)


# ---------------------------------------------------------------------------
# deepinfra
# ---------------------------------------------------------------------------

def test_deepinfra_balance_row(monkeypatch):
    # stripe_balance is negative = credit we HOLD; prepaid = -stripe_balance
    cap = Capture([{"checklist": {"stripe_balance": -45.67}}])
    monkeypatch.setattr(_di, "http_json", cap)
    row = _di.balance({"DEEPINFRA_API_KEY": "di-key"}, NOW)
    assert row["provider"] == "deepinfra"
    assert row["prepaid_left_usd"] == 45.67
    assert row["granted_usd"] is None
    assert row["spent_usd"] is None
    assert row["left_usd"] is None
    assert row["source"] == "api"


def test_deepinfra_auth_header(monkeypatch):
    cap = Capture([{"checklist": {"stripe_balance": -10.0}}])
    monkeypatch.setattr(_di, "http_json", cap)
    _di.balance({"DEEPINFRA_API_KEY": "di-test-key"}, NOW)
    assert cap.calls[0]["headers"].get("Authorization") == "Bearer di-test-key"


def test_deepinfra_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _di.balance({}, NOW)


def test_deepinfra_missing_checklist_raises(monkeypatch):
    cap = Capture([{"unexpected": "response"}])
    monkeypatch.setattr(_di, "http_json", cap)
    with pytest.raises(RuntimeError):
        _di.balance({"DEEPINFRA_API_KEY": "di-key"}, NOW)


# ---------------------------------------------------------------------------
# runpod
# ---------------------------------------------------------------------------

def test_runpod_balance_row(monkeypatch):
    cap = Capture([{"data": {"myself": {"clientBalance": 255.66, "currentSpendPerHr": 0.42}}}])
    monkeypatch.setattr(_rp, "http_json", cap)
    row = _rp.balance({"RUNPOD_API_KEY": "rp-key"}, NOW)
    assert row["provider"] == "runpod"
    assert row["prepaid_left_usd"] == 255.66
    assert row["granted_usd"] is None
    assert row["spent_usd"] is None
    assert row["left_usd"] is None
    assert "spend_per_hr=0.42" in row["note"]
    assert row["source"] == "api"


def test_runpod_auth_header(monkeypatch):
    cap = Capture([{"data": {"myself": {"clientBalance": 100.0, "currentSpendPerHr": 0.0}}}])
    monkeypatch.setattr(_rp, "http_json", cap)
    _rp.balance({"RUNPOD_API_KEY": "rp-secret"}, NOW)
    assert cap.calls[0]["headers"].get("Authorization") == "Bearer rp-secret"


def test_runpod_url_no_key(monkeypatch):
    """Key must never appear in the URL (POST body/header only)."""
    cap = Capture([{"data": {"myself": {"clientBalance": 50.0, "currentSpendPerHr": 0.1}}}])
    monkeypatch.setattr(_rp, "http_json", cap)
    _rp.balance({"RUNPOD_API_KEY": "super-secret-key"}, NOW)
    assert "super-secret-key" not in cap.calls[0]["url"]


def test_runpod_uses_post_body(monkeypatch):
    """GraphQL query is sent as POST body data, not as URL param."""
    cap = Capture([{"data": {"myself": {"clientBalance": 10.0, "currentSpendPerHr": 0.0}}}])
    monkeypatch.setattr(_rp, "http_json", cap)
    _rp.balance({"RUNPOD_API_KEY": "rp-key"}, NOW)
    assert cap.calls[0]["data"] is not None
    assert "clientBalance" in str(cap.calls[0]["data"])


def test_runpod_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _rp.balance({}, NOW)


# ---------------------------------------------------------------------------
# scaleway
# ---------------------------------------------------------------------------

_SCW_CREDS = {"SCW_SECRET_KEY": "scw-token", "SCW_ORGANIZATION_ID": "org-abc"}

def test_scaleway_balance_row(monkeypatch):
    cap = Capture([{"discounts": [
        {"value": 5000.0, "value_used": 1200.0, "value_remaining": 3800.0},
        {"value": 1000.0, "value_used": 400.0, "value_remaining": 600.0},
    ]}])
    monkeypatch.setattr(_scw, "http_json", cap)
    row = _scw.balance(_SCW_CREDS, NOW)
    assert row["provider"] == "scaleway"
    assert row["granted_usd"] == 6000.0
    assert row["spent_usd"] == 1600.0
    assert row["left_usd"] == 4400.0
    assert row["prepaid_left_usd"] is None
    assert row["source"] == "api"


def test_scaleway_money_objects(monkeypatch):
    """Money values as {units, nanos} dicts must be parsed correctly."""
    cap = Capture([{"discounts": [
        {"value": {"units": 1000, "nanos": 500000000},
         "value_used": {"units": 200, "nanos": 0},
         "value_remaining": {"units": 800, "nanos": 500000000}},
    ]}])
    monkeypatch.setattr(_scw, "http_json", cap)
    row = _scw.balance(_SCW_CREDS, NOW)
    assert row["granted_usd"] == pytest.approx(1000.5, abs=0.01)
    assert row["spent_usd"] == 200.0
    assert row["left_usd"] == pytest.approx(800.5, abs=0.01)


def test_scaleway_auth_header(monkeypatch):
    cap = Capture([{"discounts": [{"value": 100.0, "value_used": 0.0, "value_remaining": 100.0}]}])
    monkeypatch.setattr(_scw, "http_json", cap)
    _scw.balance(_SCW_CREDS, NOW)
    assert cap.calls[0]["headers"].get("X-Auth-Token") == "scw-token"


def test_scaleway_org_in_url(monkeypatch):
    """Organization ID must be in the URL."""
    cap = Capture([{"discounts": [{"value": 100.0, "value_used": 0.0, "value_remaining": 100.0}]}])
    monkeypatch.setattr(_scw, "http_json", cap)
    _scw.balance(_SCW_CREDS, NOW)
    assert "org-abc" in cap.calls[0]["url"]


def test_scaleway_missing_creds_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _scw.balance({}, NOW)


def test_scaleway_empty_discounts_raises(monkeypatch):
    cap = Capture([{"discounts": []}])
    monkeypatch.setattr(_scw, "http_json", cap)
    with pytest.raises(RuntimeError):
        _scw.balance(_SCW_CREDS, NOW)


# ---------------------------------------------------------------------------
# digitalocean
# ---------------------------------------------------------------------------

def test_digitalocean_balance_row(monkeypatch):
    cap = Capture([{"month_to_date_usage": "42.50", "account_balance": "-157.30"}])
    monkeypatch.setattr(_do, "http_json", cap)
    row = _do.balance({"DIGITALOCEAN_TOKEN": "do-token"}, NOW)
    assert row["provider"] == "digitalocean"
    assert row["spent_usd"] == 42.5
    assert row["left_usd"] == 157.3
    assert row["granted_usd"] is None
    assert row["source"] == "api"


def test_digitalocean_positive_balance_no_left(monkeypatch):
    """Positive account_balance (owed) means no credit remaining."""
    cap = Capture([{"month_to_date_usage": "10.0", "account_balance": "5.0"}])
    monkeypatch.setattr(_do, "http_json", cap)
    row = _do.balance({"DIGITALOCEAN_TOKEN": "do-token"}, NOW)
    assert row["left_usd"] is None


def test_digitalocean_auth_header(monkeypatch):
    cap = Capture([{"month_to_date_usage": "0", "account_balance": "0"}])
    monkeypatch.setattr(_do, "http_json", cap)
    _do.balance({"DIGITALOCEAN_TOKEN": "do-secret"}, NOW)
    assert cap.calls[0]["headers"].get("Authorization") == "Bearer do-secret"


def test_digitalocean_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _do.balance({}, NOW)


def test_digitalocean_missing_month_to_date_usage_raises(monkeypatch):
    """Absent month_to_date_usage must raise, not silently return 0."""
    cap = Capture([{"account_balance": "-50.0"}])
    monkeypatch.setattr(_do, "http_json", cap)
    with pytest.raises((KeyError, RuntimeError)):
        _do.balance({"DIGITALOCEAN_TOKEN": "do-token"}, NOW)


def test_digitalocean_missing_account_balance_raises(monkeypatch):
    """Absent account_balance must raise, not silently return 0."""
    cap = Capture([{"month_to_date_usage": "10.0"}])
    monkeypatch.setattr(_do, "http_json", cap)
    with pytest.raises((KeyError, RuntimeError)):
        _do.balance({"DIGITALOCEAN_TOKEN": "do-token"}, NOW)


def test_digitalocean_zero_spent_is_valid(monkeypatch):
    """Present-but-zero month_to_date_usage must NOT raise (spent 0.0 is legal)."""
    cap = Capture([{"month_to_date_usage": "0", "account_balance": "0"}])
    monkeypatch.setattr(_do, "http_json", cap)
    row = _do.balance({"DIGITALOCEAN_TOKEN": "do-token"}, NOW)
    assert row["spent_usd"] == 0.0
    assert row["left_usd"] is None


# ---------------------------------------------------------------------------
# daytona
# ---------------------------------------------------------------------------

_DTN_CREDS = {"DAYTONA_API_KEY": "dtn-key", "DAYTONA_ORGANIZATION_ID": "org-xyz"}

def test_daytona_balance_row_with_wallet(monkeypatch):
    """When wallet probe succeeds, prepaid = balanceCents / 100."""
    responses = [
        {"name": "my-key", "permissions": ["read"]},  # api-keys/current
        {"balanceCents": 4200},                         # wallet
    ]
    cap = Capture(responses)
    monkeypatch.setattr(_dtn, "http_json", cap)
    row = _dtn.balance(_DTN_CREDS, NOW)
    assert row["provider"] == "daytona"
    assert row["prepaid_left_usd"] == 42.0
    assert row["granted_usd"] is None
    assert row["spent_usd"] is None
    assert row["source"] == "api"


def test_daytona_no_wallet_raises(monkeypatch):
    """When wallet is OIDC-gated (fails), raise RuntimeError so run.py catches."""
    import urllib.error
    import urllib.request as _ur

    call_count = [0]
    def fake_http_json(url, headers=None, timeout=30, data=None, method=None):
        call_count[0] += 1
        if "api-keys/current" in url:
            return {"name": "my-key"}
        # wallet probe
        raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)

    monkeypatch.setattr(_dtn, "http_json", fake_http_json)
    with pytest.raises(RuntimeError, match="wallet"):
        _dtn.balance(_DTN_CREDS, NOW)


def test_daytona_auth_header(monkeypatch):
    cap = Capture([
        {"name": "key", "permissions": []},
        {"balanceCents": 100},
    ])
    monkeypatch.setattr(_dtn, "http_json", cap)
    _dtn.balance(_DTN_CREDS, NOW)
    for call in cap.calls:
        assert call["headers"].get("Authorization") == "Bearer dtn-key"


def test_daytona_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _dtn.balance({}, NOW)


def test_daytona_missing_org_id_raises_before_wallet(monkeypatch):
    """Missing DAYTONA_ORGANIZATION_ID must raise with the manual-record message
    BEFORE any wallet HTTP call is made."""
    call_count = [0]

    def fake_http_json(url, headers=None, timeout=30, data=None, method=None):
        call_count[0] += 1
        if "api-keys/current" in url:
            return {"name": "my-key"}
        # wallet should never be reached
        raise AssertionError(f"unexpected call to {url}")

    monkeypatch.setattr(_dtn, "http_json", fake_http_json)
    with pytest.raises(RuntimeError, match="DAYTONA_ORGANIZATION_ID"):
        _dtn.balance({"DAYTONA_API_KEY": "dtn-key"}, NOW)
    # only the key-validity call was made; no wallet call
    assert call_count[0] == 1


# ---------------------------------------------------------------------------
# Registry: all BALANCE slugs ∈ CANONICAL
# ---------------------------------------------------------------------------

def test_balance_slugs_in_canonical():
    for slug, _ in registry.BALANCE:
        assert slug in registry.CANONICAL, f"BALANCE slug not in CANONICAL: {slug}"


def test_meter_slugs_in_canonical():
    for slug, _ in registry.METER:
        assert slug in registry.CANONICAL, f"METER slug not in CANONICAL: {slug}"


def test_balance_has_b3_providers():
    """After B3, BALANCE must contain all six REST providers."""
    slugs = {slug for slug, _ in registry.BALANCE}
    for expected in ("openrouter", "deepinfra", "runpod", "scaleway", "digitalocean", "daytona"):
        assert expected in slugs, f"BALANCE missing: {expected}"


def test_balance_callables():
    """All BALANCE entries must be (str, callable) pairs."""
    for slug, fn in registry.BALANCE:
        assert isinstance(slug, str)
        assert callable(fn)
