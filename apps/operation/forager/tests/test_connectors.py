"""Wise connector tests. All hermetic — monkeypatch _fetch_month, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_connectors.py -q
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.connectors import wise


# ---------------------------------------------------------------------------
# _match / ALIAS tests
# ---------------------------------------------------------------------------

def test_wise_counterparty_matching():
    assert wise._match("Google Cloud EMEA Ltd") == "google"
    assert wise._match("AUTOMAT-IT OU") == "aws"
    assert wise._match("Amazon retail") is None      # office hardware stays unmatched
    assert wise._match("LETS DEEL LTD") is None      # payroll is ops, not compute


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
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-02")
    assert {r["provider"] for r in rows} == {"runpod", ""}
    assert all(r["wise_ref"] for r in rows)


def test_outflow_rows_wise_ref_and_paid_at(monkeypatch):
    """Each row has correct wise_ref (str(id)) and paid_at (createdOn[:10])."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "Anthropic",
         "primaryAmount": "200 EUR", "secondaryAmount": "", "createdOn": "2026-06-15T10:30:00Z", "id": 42}
    ])
    rows = wise.outflow_rows({}, ["2026-06"], fx=1.14, today="2026-07-02")
    assert len(rows) == 1
    assert rows[0]["wise_ref"] == "42"
    assert rows[0]["paid_at"] == "2026-06-15"
    assert rows[0]["month"] == "2026-06"


def test_outflow_rows_amount_eur_usd(monkeypatch):
    """amount_eur and amount_usd are positive outflow magnitudes, rounded to 2dp."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-05-01", "id": 99}
    ])
    rows = wise.outflow_rows({}, ["2026-05"], fx=1.14, today="2026-07-02")
    assert len(rows) == 1
    assert rows[0]["amount_eur"] == 100.0
    assert rows[0]["amount_usd"] == round(100.0 * 1.14, 2)


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
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-02")
    assert len(rows) == 1
    assert rows[0]["wise_ref"] == "2"


def test_pending_filtered_out(monkeypatch):
    """Non-COMPLETED/IN_PROGRESS transactions are filtered."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "PENDING", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 5},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "OpenAI",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 6},
    ])
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-02")
    assert len(rows) == 1
    assert rows[0]["wise_ref"] == "6"


def test_in_progress_included(monkeypatch):
    """IN_PROGRESS transactions are included (same as COMPLETED)."""
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "IN_PROGRESS", "type": "TRANSFER", "title": "Cloudflare",
         "primaryAmount": "30 EUR", "secondaryAmount": "", "createdOn": "2026-07-03", "id": 7}
    ])
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-03")
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
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-02")
    assert len(rows) == 1
    assert rows[0]["wise_ref"] == "21"


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
    rows = wise.outflow_rows({}, ["2026-06"], fx=1.14, today="2026-07-02")
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
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-01")
    assert len(rows) == 1
    r = rows[0]
    for field in ("paid_at", "month", "provider", "counterparty",
                  "amount_eur", "amount_usd", "wise_ref", "pulled_at"):
        assert field in r, f"missing field: {field}"


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
    rows = wise.outflow_rows({}, ["2026-05", "2026-06"], fx=1.14, today="2026-07-02")
    assert len(rows) == 2
    assert {r["month"] for r in rows} == {"2026-05", "2026-06"}


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
