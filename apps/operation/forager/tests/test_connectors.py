"""Connector tests. All hermetic — monkeypatch _fetch_month / http_json, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_connectors.py -q
"""
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.connectors import wise
from ingest.connectors import common
from ingest.connectors import registry


# ---------------------------------------------------------------------------
# http_json POST extension
# ---------------------------------------------------------------------------

def _cap_urlopen(monkeypatch):
    """Helper: patch urllib.request.urlopen to capture request objects.
    Returns the list that collects captured Request objects.
    json.load on the response object always returns {}.
    """
    import urllib.request as _ur
    _reqs = []

    class _CapResp:
        def __init__(self, r): _reqs.append(r)
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self): return b'{}'

    monkeypatch.setattr(_ur, "urlopen", lambda req, timeout=30: _CapResp(req))
    # Patch _json.load so it doesn't try to read from our fake response object
    monkeypatch.setattr(common._json, "load", lambda f: {})
    return _reqs


def test_http_json_get_backward_compatible(monkeypatch):
    """http_json(url) without data still fires a GET with UA."""
    _reqs = _cap_urlopen(monkeypatch)
    result = common.http_json("https://example.com/api")
    req = _reqs[0]
    assert req.get_method() == "GET"
    assert req.get_header("User-agent") == common.UA
    assert req.data is None


def test_http_json_post_with_data_dict(monkeypatch):
    """http_json(url, data=dict) sends POST with JSON body and Content-Type."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/api", data={"key": "value"})
    req = _reqs[0]
    assert req.get_method() == "POST"
    assert req.get_header("User-agent") == common.UA
    assert req.get_header("Content-type") == "application/json"
    body = json.loads(req.data.decode())
    assert body == {"key": "value"}


def test_http_json_post_explicit_method(monkeypatch):
    """http_json(url, method='POST') without data still sends POST (no body)."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/api", method="POST")
    req = _reqs[0]
    assert req.get_method() == "POST"


def test_http_json_post_bytes_data(monkeypatch):
    """http_json(url, data=bytes) sends raw bytes as body (POST)."""
    _reqs = _cap_urlopen(monkeypatch)
    raw = b'raw body bytes'
    common.http_json("https://example.com/api", data=raw)
    req = _reqs[0]
    assert req.data == raw
    assert req.get_method() == "POST"


def test_http_json_ua_always_set(monkeypatch):
    """UA header is set on both GET and POST requests."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/a")
    common.http_json("https://example.com/b", data={"x": 1})
    assert _reqs[0].get_header("User-agent") == common.UA
    assert _reqs[1].get_header("User-agent") == common.UA


# ---------------------------------------------------------------------------
# registry.CANONICAL excludes non-billing slugs
# ---------------------------------------------------------------------------

def test_canonical_contains_compute_slugs():
    """Compute and infra slugs must be in CANONICAL."""
    must_have = ["google", "aws", "openai", "vast.ai", "ovhcloud", "runpod", "scaleway"]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing compute slug: {slug}"


def test_canonical_excludes_non_billing_slugs():
    """Operating-expense slugs must NOT be in CANONICAL."""
    must_not_have = ["deel", "google-workspace", "slack", "wise", "self-issued"]
    for slug in must_not_have:
        assert slug not in registry.CANONICAL, f"CANONICAL wrongly contains: {slug}"


# ---------------------------------------------------------------------------
# _match / ALIAS tests
# ---------------------------------------------------------------------------

def test_wise_counterparty_matching():
    assert wise._match("Google Cloud EMEA Ltd") == "google"
    assert wise._match("AUTOMAT-IT OU") == "aws"
    assert wise._match("Amazon retail") is None      # office hardware is not AWS
    assert wise._match("LETS DEEL LTD") is None      # payroll is ops, not compute


def test_wise_operating_category_matching():
    assert wise._ops_match("LETS DEEL LTD") == ("deel", "payroll")
    assert wise._ops_match("Enty") == ("enty", "admin")
    assert wise._ops_match("Gaswerksiedlung Berlin GmbH") == ("", "office")
    assert wise._ops_match("Some Tax Consultant") == ("", "admin")


def test_match_runpod():
    assert wise._match("RunPod Inc") == "runpod"


def test_match_elevenlabs():
    assert wise._match("ElevenLabs BV") == "elevenlabs"


def test_match_returns_none_for_unknown():
    assert wise._match("Gaswerksiedlung AG") is None


# ---------------------------------------------------------------------------
# outflow_rows: per-transaction emission
# ---------------------------------------------------------------------------

def test_outflow_rows_keeps_unmatched(monkeypatch):
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "RunPod",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 11},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "SO LAB X",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 12}])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert {r["provider"] for r in rows} == {"runpod", ""}


def test_outflow_rows_paid_at(monkeypatch):
    """Each row has paid_at from createdOn[:10]."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Anthropic",
         "primaryAmount": "200 EUR", "secondaryAmount": "", "createdOn": "2026-06-15T10:30:00Z", "id": 42}
    ])
    rows = wise.outflow_rows({}, ["2026-06"])
    assert len(rows) == 1
    assert rows[0]["paid_at"] == "2026-06-15"


def test_outflow_rows_operating_categories(monkeypatch):
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Enty",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-06-01", "id": 1},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Amazon retail",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-06-02", "id": 2},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Anthropic Claude Subscription",
         "primaryAmount": "90 EUR", "secondaryAmount": "", "createdOn": "2026-06-03", "id": 3},
    ])
    rows = wise.outflow_rows({}, ["2026-06"])
    by_counterparty = {row["counterparty"]: row for row in rows}
    assert by_counterparty["Enty"]["provider"] == "enty"
    assert by_counterparty["Enty"]["category"] == "admin"
    assert by_counterparty["Amazon retail"]["provider"] == ""
    assert by_counterparty["Amazon retail"]["category"] == "office"
    assert by_counterparty["Anthropic Claude Subscription"]["provider"] == "anthropic"
    assert by_counterparty["Anthropic Claude Subscription"]["category"] == "saas"


def test_outflow_rows_amount_eur(monkeypatch):
    """amount_eur is the positive outflow magnitude, rounded to 2dp.
    (amount_usd was dropped from the payments schema — reconstructed in SQL.)"""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-05-01", "id": 99}
    ])
    rows = wise.outflow_rows({}, ["2026-05"])
    assert len(rows) == 1
    assert rows[0]["amount_eur"] == 100.0


# ---------------------------------------------------------------------------
# CARD_CHECK and non-COMPLETED filtering
# ---------------------------------------------------------------------------

def test_card_check_filtered_out(monkeypatch):
    """CARD_CHECK transactions must be filtered even if status=COMPLETED."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "CARD_CHECK", "title": "RunPod",
         "primaryAmount": "1 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 1},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "RunPod",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 2},
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    assert rows[0]["paid_at"] == "2026-07-02"


def test_pending_filtered_out(monkeypatch):
    """Non-COMPLETED/IN_PROGRESS transactions are filtered."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "PENDING", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 5},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 6},
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    assert rows[0]["paid_at"] == "2026-07-02"


def test_in_progress_included(monkeypatch):
    """IN_PROGRESS transactions are included (same as COMPLETED)."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "IN_PROGRESS", "type": "TRANSFER", "title": "Cloudflare",
         "primaryAmount": "30 EUR", "secondaryAmount": "", "createdOn": "2026-07-03", "id": 7}
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    assert rows[0]["provider"] == "cloudflare"


# ---------------------------------------------------------------------------
# Positive-amount (incoming) filtering
# ---------------------------------------------------------------------------

def test_incoming_positive_skipped(monkeypatch):
    """Incoming (positive) transactions are skipped — only outflows emitted."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Customer refund",
         "primaryAmount": "positive 200 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 20},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 21},
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    assert rows[0]["counterparty"] == "OpenAI"


# ---------------------------------------------------------------------------
# EUR/USD handling — secondaryAmount fallback
# ---------------------------------------------------------------------------

def test_usd_primary_uses_secondary_eur(monkeypatch):
    """When primaryAmount is USD, secondaryAmount EUR is used for eur field."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Fireworks",
         "primaryAmount": "114 USD", "secondaryAmount": "100 EUR",
         "createdOn": "2026-06-10", "id": 30}
    ])
    rows = wise.outflow_rows({}, ["2026-06"])
    assert len(rows) == 1
    assert rows[0]["amount_eur"] == 100.0


# ---------------------------------------------------------------------------
# Row shape: all required fields present
# ---------------------------------------------------------------------------

def test_row_has_all_required_fields(monkeypatch):
    """Every row must contain all fields required by the payments datasource."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Scaleway",
         "primaryAmount": "75 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 55}
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    r = rows[0]
    assert set(r.keys()) == {"paid_at", "provider", "counterparty",
                             "category", "amount_eur"}


# ---------------------------------------------------------------------------
# Multiple months
# ---------------------------------------------------------------------------

def test_outflow_rows_multiple_months(monkeypatch):
    """outflow_rows iterates all months and collects per-transaction rows."""
    calls = []
    def fake_fetch(c, m):
        calls.append(m)
        return [{"status": "COMPLETED", "type": "TRANSFER", "title": "RunPod",
                 "primaryAmount": "10 EUR", "secondaryAmount": "", "createdOn": f"{m}-15", "id": hash(m)}]
    monkeypatch.setattr(wise, "_fetch_month", fake_fetch)
    rows = wise.outflow_rows({}, ["2026-05", "2026-06"])
    assert len(rows) == 2
    assert {r["paid_at"][:7] for r in rows} == {"2026-05", "2026-06"}


# ---------------------------------------------------------------------------
# _amount helper
# ---------------------------------------------------------------------------

def test_amount_parses_eur():
    v, c = wise._amount("100 EUR")
    assert v == 100.0
    assert c == "EUR"


def test_amount_parses_usd_with_plus():
    v, c = wise._amount("+200 USD")
    assert v == 200.0
    assert c == "USD"


def test_amount_handles_empty():
    v, c = wise._amount("")
    assert v == 0.0
    assert c == "EUR"


def test_amount_parses_comma_thousands():
    v, c = wise._amount("1,234.56 EUR")
    assert v == 1234.56
    assert c == "EUR"


# ---------------------------------------------------------------------------
# None-amount handling — pinning strip_html guard behavior
# ---------------------------------------------------------------------------

def test_outflow_rows_survives_null_amounts(monkeypatch):
    """Activities with None primaryAmount/secondaryAmount should not raise.
    primaryAmount=None with outgoing transaction → amount parses to 0.0 → skipped by eur >= 0 rule.
    secondaryAmount=None with primaryAmount EUR → uses primaryAmount, emits row normally.
    """
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "RunPod",
         "primaryAmount": None, "secondaryAmount": "", "createdOn": "2026-07-01", "id": 101},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "75 EUR", "secondaryAmount": None, "createdOn": "2026-07-02", "id": 102},
    ])
    rows = wise.outflow_rows({}, ["2026-07"])
    assert len(rows) == 1
    assert rows[0]["amount_eur"] == 75.0
