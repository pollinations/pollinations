"""Hermetic tests for meter connectors (B5).

Connectors: deepinfra, ovh, vast, fireworks, aws, gcp, openai_.
All hermetic — http_json monkeypatched; run_cmd injected for CLI connectors.
No network, no SOPS, no real credentials.

Run: cd apps/operation/forager && python3 -m pytest tests/test_providers_meter.py -q
"""
import json
import os
import sys
import tempfile
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import ingest.connectors.providers.deepinfra as _di
import ingest.connectors.providers.ovh as _ovh
import ingest.connectors.providers.vast as _vast
import ingest.connectors.providers.fireworks as _fw
import ingest.connectors.providers.openai_ as _oai
import ingest.connectors.providers.aws as _aws
import ingest.connectors.providers.gcp as _gcp
from ingest.connectors import registry

TODAY = "2026-07-03"
MONTHS = ["2026-04", "2026-05", "2026-06"]


# ---------------------------------------------------------------------------
# Capture / fake helpers
# ---------------------------------------------------------------------------

class Capture:
    """Monkeypatch-friendly http_json replacement that records calls."""
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def __call__(self, url, headers=None, timeout=30, data=None, method=None):
        self.calls.append({"url": url, "headers": headers or {}, "data": data})
        return self._responses.pop(0)


def _fake_result(stdout="", stderr="", returncode=0):
    r = types.SimpleNamespace()
    r.stdout = stdout
    r.stderr = stderr
    r.returncode = returncode
    return r


# ===========================================================================
# deepinfra.meter
# ===========================================================================

_DI_CREDS = {"DEEPINFRA_API_KEY": "di-key"}


def test_deepinfra_meter_cents_divided_by_100(monkeypatch):
    """total_cost 877 cents → 8.77 USD."""
    # Per month query → one month response with 877 cents
    responses = [
        {"months": [{"total_cost": 877, "period": "2026-04"}]},
        {"months": []},
        {"months": []},
    ]
    cap = Capture(responses)
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    assert any(r["cash_amount"] == pytest.approx(8.77, abs=0.001) for r in rows)


def test_deepinfra_meter_epoch_integers_in_url(monkeypatch):
    """from= and to= parameters must be epoch-second integers (not date strings)."""
    responses = [{"months": [{"total_cost": 100, "period": "2026-04"}]}]
    cap = Capture(responses)
    monkeypatch.setattr(_di, "http_json", cap)
    _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    url = cap.calls[0]["url"]
    import urllib.parse
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    from_val = qs.get("from", [None])[0]
    to_val = qs.get("to", [None])[0]
    assert from_val is not None, "from= param missing"
    assert to_val is not None, "to= param missing"
    # Must parse as integers (not floats, not date strings)
    assert int(from_val) == float(from_val), f"from= not integer: {from_val}"
    assert int(to_val) == float(to_val), f"to= not integer: {to_val}"
    # Sanity: should be a reasonable unix epoch (2026-04-01 ≈ 1775001600)
    assert int(from_val) > 1_700_000_000


def test_deepinfra_meter_cash_amount(monkeypatch):
    """Meter rows put paid usage into cash_amount."""
    cap = Capture([{"months": [{"total_cost": 500, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows[0]["credit_amount"] == 0.0
    assert rows[0]["cash_amount"] == 5.0


def test_deepinfra_meter_source_api(monkeypatch):
    """Meter rows must have source=api."""
    cap = Capture([{"months": [{"total_cost": 500, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows[0]["source"] == "api"


def test_deepinfra_meter_zero_months_excluded(monkeypatch):
    """Months with zero cost must be excluded from output."""
    cap = Capture([{"months": [{"total_cost": 0, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows == []


def test_deepinfra_meter_missing_key_raises():
    """Missing DEEPINFRA_API_KEY is a configuration error."""
    with pytest.raises(RuntimeError, match="DEEPINFRA_API_KEY"):
        _di.meter({}, ["2026-04"], TODAY)


def test_deepinfra_meter_provider_slug(monkeypatch):
    """Provider slug must be 'deepinfra'."""
    cap = Capture([{"months": [{"total_cost": 200, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows[0]["provider"] == "deepinfra"


def test_deepinfra_meter_has_no_freshness_timestamp(monkeypatch):
    """Meter rows do not carry per-row freshness timestamps."""
    cap = Capture([{"months": [{"total_cost": 200, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert set(rows[0]) == {
        "month",
        "provider",
        "currency",
        "credit_amount",
        "cash_amount",
        "source",
    }


def test_deepinfra_meter_to_capped_at_now(monkeypatch):
    """to= epoch must never exceed time.time() (cap for current-month window)."""
    import time as _time_mod

    fixed_now = 1_780_272_000  # 2026-06-01 00:00:00 UTC — mid-future relative to 2026-06

    monkeypatch.setattr(_di, "time", type(_time_mod)("_fake_time"))
    # Inject a fake time module with a fixed time() into the deepinfra module
    import types
    fake_time_mod = types.ModuleType("time")
    fake_time_mod.time = lambda: fixed_now
    monkeypatch.setattr(_di, "time", fake_time_mod)

    cap = Capture([{"months": [{"total_cost": 100}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    # Query 2026-06 — whose month-end would be 2026-07-01 00:00:00 UTC (1_782_950_400)
    # But time.time() is fixed at 2026-06-01 00:00:00, so to must be ≤ fixed_now
    _di.meter(_DI_CREDS, ["2026-06"], TODAY)
    url = cap.calls[0]["url"]
    import urllib.parse
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    to_val = int(qs["to"][0])
    assert to_val <= fixed_now, f"to= {to_val} exceeds fixed now={fixed_now}"


# ===========================================================================
# ovh.meter
# ===========================================================================

_OVH_CREDS = {
    "OVH_APPLICATION_KEY": "test_app_key",
    "OVH_APPLICATION_SECRET": "test_secret",
    "OVH_CONSUMER_KEY": "test_consumer",
}
_OVH_TS = 1735000000


def test_ovh_meter_use_only_filtered(monkeypatch):
    """Only type=USE movements count; VOUCHER rows must be ignored."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    # movement list with 2 IDs
    movement_ids = [101, 102]
    movement_use = {
        "type": "USE",
        "amount": {"value": "-100.00"},
        "creationDate": "2026-04-15T10:00:00+00:00",
    }
    movement_voucher = {
        "type": "VOUCHER",
        "amount": {"value": "500.00"},
        "creationDate": "2026-04-01T10:00:00+00:00",
    }
    cap = Capture([movement_ids, movement_use, movement_voucher])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    # Only 1 row for 2026-04 (the USE); VOUCHER ignored
    assert len(rows) == 1
    assert rows[0]["month"] == "2026-04"


def test_ovh_meter_native_eur(monkeypatch):
    """USE amount is kept in native EUR."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    movement_ids = [101]
    movement_use = {
        "type": "USE",
        "amount": {"value": "-100.00"},
        "creationDate": "2026-04-15T10:00:00+00:00",
    }
    cap = Capture([movement_ids, movement_use])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    assert rows[0]["credit_amount"] == pytest.approx(100.0, abs=0.01)
    assert rows[0]["cash_amount"] == 0.0
    assert rows[0]["currency"] == "EUR"


def test_ovh_meter_credit_amount(monkeypatch):
    """Meter rows put credit burn into credit_amount."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([[101], {"type": "USE", "amount": {"value": "-50.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-05"], TODAY)
    assert rows[0]["credit_amount"] == 50.0


def test_ovh_meter_source_api(monkeypatch):
    """Meter rows must have source=api."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([[101], {"type": "USE", "amount": {"value": "-50.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-05"], TODAY)
    assert rows[0]["source"] == "api"


def test_ovh_meter_month_grouping(monkeypatch):
    """Multiple USE movements in the same month should be summed into one row."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    movement_ids = [101, 102]
    m1 = {"type": "USE", "amount": {"value": "-30.00"}, "creationDate": "2026-04-10T00:00:00+00:00"}
    m2 = {"type": "USE", "amount": {"value": "-20.00"}, "creationDate": "2026-04-20T00:00:00+00:00"}
    cap = Capture([movement_ids, m1, m2])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04"], TODAY)
    assert len(rows) == 1
    assert rows[0]["credit_amount"] == pytest.approx(50.0, abs=0.01)


def test_ovh_meter_empty_movements(monkeypatch):
    """Empty movement list returns empty rows."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([[]])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04", "2026-05"], TODAY)
    assert rows == []


# ===========================================================================
# vast.meter
# ===========================================================================

_VAST_CREDS = {}

# Epoch for 2026-04-15 UTC
_APR_TS = 1776211200  # 2026-04-15 00:00:00 UTC
_MAY_TS = 1778803200  # 2026-05-15 00:00:00 UTC

_VAST_INVOICES_JSON = json.dumps([
    {"type": "charge", "timestamp": 1776211200, "amount": 50.0},
    {"type": "charge", "timestamp": 1776211200, "amount": 20.0},
    {"type": "charge", "timestamp": 1778803200, "amount": 30.0},
    {"type": "deposit", "timestamp": 1776211200, "amount": 100.0},  # must be excluded
])


def test_vast_meter_charge_rows_only():
    """Only type=charge rows count; deposit rows are excluded."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=fake_run)
    months_seen = {r["month"] for r in rows}
    # Both April charges present; May charge present; April deposit excluded
    for r in rows:
        assert r["provider"] == "vast.ai"
    # No negative or implausibly large amounts from deposits
    for r in rows:
        assert r["cash_amount"] < 200.0


def test_vast_meter_grouped_by_month():
    """Multiple charge rows in same month are summed."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=fake_run)
    apr = next((r for r in rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["cash_amount"] == pytest.approx(70.0, abs=0.01)  # 50 + 20


def test_vast_meter_cash_amount():
    """Meter rows put paid usage into cash_amount."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["credit_amount"] == 0.0
        assert r["cash_amount"] > 0


def test_vast_meter_source_cli():
    """Meter rows must have source=cli."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["source"] == "cli"


def test_vast_meter_cli_command():
    """Must call vastai show invoices --raw."""
    cmds = []
    fake_run = lambda cmd, **kw: (cmds.append(cmd), _fake_result(stdout=_VAST_INVOICES_JSON))[1]
    _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    assert cmds[0] == ["vastai", "show", "invoices", "--raw"]


def test_vast_meter_nonzero_rc_no_stdout_in_error():
    """returncode != 0 → raises without stdout/stderr in error message."""
    fake_run = lambda cmd, **kw: _fake_result(
        stdout="SECRET_DATA here", stderr="SECRET_STDERR", returncode=1
    )
    with pytest.raises(RuntimeError) as exc_info:
        _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    msg = str(exc_info.value)
    assert "SECRET_DATA" not in msg
    assert "SECRET_STDERR" not in msg


def test_vast_meter_empty_returns_empty():
    """No charge rows → empty list."""
    fake_run = lambda cmd, **kw: _fake_result(stdout="[]")
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    assert rows == []


# ===========================================================================
# fireworks.meter
# ===========================================================================

_FW_CREDS = {"FIREWORKS_API_KEY": "fw-key"}

# Real firectl billing list-invoices layout:
#   ID  AMOUNT  CURRENCY  TYPE  INVOICE_URL  STATE  TARGET_DATE  TARGET_TIME  PAID_DATE  PAID_TIME
# TARGET_DATE + TARGET_TIME are two separate whitespace tokens.
# POSTPAID invoice cut 2026-07-01 covers usage month 2026-06.
# PREPAID_CREDITS rows have stripe URLs and are excluded by type.
# 0.00-amount POSTPAID rows exist and are excluded by amount.
_FW_INVOICE_OUTPUT = """\
ID  AMOUNT  TYPE  INVOICE URL  STATE  TARGET TIME  PAID TIME
VCbMHvhn5FwFgYHY  10.00  USD  POSTPAID_BILLING  https://invoices.withorb.com/view?token=FAKE001  PAID  2026-07-01  02:00:00  2026-07-02  07:24:50
AbCdEfGh12345678   5.50  USD  POSTPAID_BILLING  https://invoices.withorb.com/view?token=FAKE002  PAID  2026-06-01  02:00:00  2026-06-02  07:24:50
StRiPeInVoIcEurl  99.00  USD  PREPAID_CREDITS   https://pay.stripe.com/invoice/FAKE003          PAID  2026-07-01  02:00:00  2026-07-02  07:24:50
ZeRoAmOuNtInVoId   0.00  USD  POSTPAID_BILLING  https://invoices.withorb.com/view?token=FAKE004  PAID  2026-07-01  02:00:00  2026-07-02  07:24:50
DrAfTiNvOiCeIddd   8.00  USD  POSTPAID_BILLING  https://invoices.withorb.com/view?token=FAKE005  DRAFT 2026-08-01  02:00:00
"""


def test_fireworks_meter_month_minus_one():
    """Invoice cut on 2026-07-01 → usage month 2026-06."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_FW_INVOICE_OUTPUT)
    rows = _fw.meter(_FW_CREDS, ["2026-06", "2026-05"], TODAY, run_cmd=fake_run)
    months = {r["month"] for r in rows}
    assert "2026-06" in months  # inv-001 (cut 2026-07 → usage 2026-06)
    assert "2026-05" in months  # inv-002 (cut 2026-06 → usage 2026-05)


def test_fireworks_meter_prepaid_credits_ignored():
    """PREPAID_CREDITS rows must not produce meter rows."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_FW_INVOICE_OUTPUT)
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)
    # 99.00 from PREPAID_CREDITS must NOT appear
    for r in rows:
        assert r["cash_amount"] < 50.0, "prepaid top-up row leaked into meter output"


def test_fireworks_meter_postpaid_paid_only():
    """Only POSTPAID_BILLING + PAID rows count; UNPAID skipped."""
    output = (
        "InVoIcExXxUnPaId  20.00  USD  POSTPAID_BILLING"
        "  https://invoices.withorb.com/view?token=FAKEUNPAID"
        "  UNPAID  2026-07-01  02:00:00  \n"
    )
    fake_run = lambda cmd, **kw: _fake_result(stdout=output)
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)
    assert rows == []


def test_fireworks_meter_cash_amount():
    """Meter rows put paid usage into cash_amount."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_FW_INVOICE_OUTPUT)
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["credit_amount"] == 0.0
        assert r["cash_amount"] > 0


def test_fireworks_meter_source_cli():
    """Meter rows must have source=cli."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_FW_INVOICE_OUTPUT)
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["source"] == "cli"


def test_fireworks_meter_missing_key_raises():
    """Missing FIREWORKS_API_KEY is a configuration error."""
    with pytest.raises(RuntimeError, match="FIREWORKS_API_KEY"):
        _fw.meter({}, ["2026-06"], TODAY)


def test_fireworks_meter_zero_amount_excluded():
    """$0.00 POSTPAID+PAID invoice must not produce a row."""
    output = (
        "ZeRoAmOuNtInVoId   0.00  USD  POSTPAID_BILLING"
        "  https://invoices.withorb.com/view?token=FAKEZ"
        "  PAID  2026-07-01  02:00:00  2026-07-02  07:24:50\n"
    )
    fake_run = lambda cmd, **kw: _fake_result(stdout=output)
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)
    assert rows == []


def test_fireworks_meter_january_shift():
    """Invoice cut 2026-01-01 → usage month 2025-12."""
    output = (
        "JaNiNvOiCeJanWrp  10.00  USD  POSTPAID_BILLING"
        "  https://invoices.withorb.com/view?token=FAKEJAN"
        "  PAID  2026-01-01  02:00:00  2026-01-02  07:24:50\n"
    )
    fake_run = lambda cmd, **kw: _fake_result(stdout=output)
    rows = _fw.meter(_FW_CREDS, ["2025-12", "2026-01"], TODAY, run_cmd=fake_run)
    months = {r["month"] for r in rows}
    assert "2025-12" in months


# ===========================================================================
# aws.meter
# ===========================================================================

_AWS_CREDS = {}  # CLI uses ambient profile

_AWS_CASH_RESPONSE = json.dumps({
    "ResultsByTime": [
        {
            "TimePeriod": {"Start": "2026-04-01", "End": "2026-05-01"},
            "Total": {"UnblendedCost": {"Amount": "1234.56", "Unit": "USD"}},
            "Estimated": False,
        },
        {
            "TimePeriod": {"Start": "2026-05-01", "End": "2026-06-01"},
            "Total": {"UnblendedCost": {"Amount": "0.00", "Unit": "USD"}},
            "Estimated": False,
        },
    ]
})

_AWS_CREDIT_RESPONSE = json.dumps({
    "ResultsByTime": [
        {
            "TimePeriod": {"Start": "2026-04-01", "End": "2026-05-01"},
            "Total": {"UnblendedCost": {"Amount": "-300.00", "Unit": "USD"}},
            "Estimated": False,
        },
    ]
})


def _aws_run(cmd, **kw):
    """Fake run_cmd that returns different responses for cash vs credit pass."""
    flt_str = cmd[cmd.index("--filter") + 1] if "--filter" in cmd else ""
    flt = json.loads(flt_str) if flt_str else {}
    if "Not" in flt:
        # Cash pass (excludes Credit/Refund)
        return _fake_result(stdout=_AWS_CASH_RESPONSE)
    else:
        # Credit pass (RECORD_TYPE=Credit)
        return _fake_result(stdout=_AWS_CREDIT_RESPONSE)


def test_aws_meter_two_passes(_aws_run=_aws_run):
    """meter() makes two subprocess calls (cash pass + credit pass)."""
    cmds = []
    def recording_run(cmd, **kw):
        cmds.append(cmd)
        return _aws_run(cmd, **kw)
    rows = _aws.meter(_AWS_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=recording_run)
    assert len(cmds) == 2


def test_aws_meter_cash_rows():
    """Cash pass rows populate cash_amount."""
    rows = _aws.meter(_AWS_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=_aws_run)
    cash_rows = [r for r in rows if r["cash_amount"] > 0]
    assert len(cash_rows) >= 1
    apr = next((r for r in cash_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["cash_amount"] == pytest.approx(1234.56, abs=0.01)


def test_aws_meter_credit_rows():
    """Credit pass rows populate credit_amount with absolute value."""
    rows = _aws.meter(_AWS_CREDS, ["2026-04"], TODAY, run_cmd=_aws_run)
    credit_rows = [r for r in rows if r["credit_amount"] > 0]
    assert len(credit_rows) >= 1
    apr = next((r for r in credit_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["credit_amount"] == pytest.approx(300.0, abs=0.01)


def test_aws_meter_source_cli():
    """All meter rows must have source=cli."""
    rows = _aws.meter(_AWS_CREDS, ["2026-04"], TODAY, run_cmd=_aws_run)
    for r in rows:
        assert r["source"] == "cli"


def test_aws_meter_zero_excluded():
    """Zero-cost month (2026-05 cash = 0.00) must not produce a row."""
    rows = _aws.meter(_AWS_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=_aws_run)
    zero_months = [r for r in rows if r["month"] == "2026-05" and r["cash_amount"] > 0]
    assert zero_months == []


def test_aws_meter_provider_slug():
    """Provider slug must be 'aws'."""
    rows = _aws.meter(_AWS_CREDS, ["2026-04"], TODAY, run_cmd=_aws_run)
    for r in rows:
        assert r["provider"] == "aws"


def test_aws_meter_run_cmd_error_propagates():
    """run_cmd raising (e.g. JSON parse error) must propagate — not be swallowed."""
    def raising_run(cmd, **kw):
        raise RuntimeError("aws CE connection refused")

    with pytest.raises(RuntimeError, match="aws CE connection refused"):
        _aws.meter(_AWS_CREDS, ["2026-04"], TODAY, run_cmd=raising_run)


def test_aws_meter_bad_json_propagates():
    """Non-JSON stdout raises JSONDecodeError — not silently returns []."""
    fake_run = lambda cmd, **kw: _fake_result(stdout="NOT JSON", returncode=0)
    with pytest.raises(Exception):
        _aws.meter(_AWS_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)


# ===========================================================================
# gcp.meter
# ===========================================================================

_GCP_CREDS = {"GCP_BILLING_SA_JSON": '{"type": "service_account", "project_id": "test"}'}

_GCP_BQ_OUTPUT = json.dumps([
    {"month": "2026-04", "gross_amount": "1000.00", "credits_amount": "-50.00", "net_amount": "950.00", "row_count": "100"},
    {"month": "2026-05", "gross_amount": "800.00", "credits_amount": "0.00", "net_amount": "800.00", "row_count": "80"},
])


def _gcp_run_success(cmd, **kw):
    """Fake run_cmd: auth succeeds, bq query returns data."""
    if "gcloud" in cmd:
        return _fake_result(stdout="Activated service account credentials", returncode=0)
    if "bq" in cmd:
        return _fake_result(stdout=_GCP_BQ_OUTPUT, returncode=0)
    return _fake_result(returncode=0)


def _gcp_run_bq_fail(cmd, **kw):
    """Fake run_cmd: auth succeeds but bq query fails."""
    if "gcloud" in cmd:
        return _fake_result(stdout="Activated", returncode=0)
    if "bq" in cmd:
        raise RuntimeError("bq command failed")
    return _fake_result(returncode=0)


def test_gcp_meter_cash_rows():
    """GCP cash rows keep native EUR in cash_amount."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=_gcp_run_success)
    cash_rows = [r for r in rows if r["cash_amount"] > 0]
    assert len(cash_rows) >= 1
    apr = next((r for r in cash_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["cash_amount"] == pytest.approx(1000.0, abs=0.01)
    assert apr["currency"] == "EUR"
    assert apr["source"] == "bq"


def test_gcp_meter_credit_rows():
    """GCP credit rows keep native abs(credits_amount) in credit_amount."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=_gcp_run_success)
    credit_rows = [r for r in rows if r["credit_amount"] > 0]
    assert len(credit_rows) >= 1
    apr = next((r for r in credit_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["credit_amount"] == pytest.approx(50.0, abs=0.01)
    assert apr["currency"] == "EUR"


def test_gcp_meter_tempfile_deleted_on_success():
    """Key tempfile must be deleted after a SUCCESSFUL run (not just on failure)."""
    import tempfile as _tf
    import os

    import ingest.connectors.providers.gcp as _gcp_mod

    real_ntf = _tf.NamedTemporaryFile
    orig_unlink = os.unlink

    captured_path = []
    unlinked = []

    class CapturingNTF:
        """Wraps NamedTemporaryFile with delete=False so we can track the path."""
        def __init__(self, *a, **kw):
            kw["delete"] = False
            self._f = real_ntf(*a, **kw)

        @property
        def name(self):
            return self._f.name

        def write(self, data):
            return self._f.write(data)

        def flush(self):
            return self._f.flush()

        def __enter__(self):
            self._f.__enter__()
            return self

        def __exit__(self, *a):
            return self._f.__exit__(*a)

    def fake_ntf(*a, **kw):
        ntf = CapturingNTF(*a, **kw)
        captured_path.append(ntf.name)
        return ntf

    def fake_unlink(path):
        unlinked.append(path)
        try:
            orig_unlink(path)
        except FileNotFoundError:
            pass

    _gcp_mod._NamedTemporaryFile = fake_ntf
    _gcp_mod._os_unlink = fake_unlink
    try:
        rows = _gcp_mod.meter(_GCP_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=_gcp_run_success)
        assert isinstance(rows, list)
        assert len(rows) >= 1, "expected meter rows from successful bq run"
    finally:
        _gcp_mod._NamedTemporaryFile = real_ntf
        _gcp_mod._os_unlink = orig_unlink

    assert captured_path, "NamedTemporaryFile was never called"
    assert captured_path[0] in unlinked, (
        f"GCP SA key tempfile {captured_path[0]} was NOT deleted after successful run"
    )


def test_gcp_meter_tempfile_deleted_even_on_raise():
    """Key tempfile must be deleted even when bq command raises (finally-unlink)."""
    import tempfile as _tf
    import os

    real_ntf = _tf.NamedTemporaryFile

    class CapturingNTF:
        """Wraps NamedTemporaryFile, captures name, uses delete=False so we can track."""
        def __init__(self, *a, **kw):
            kw["delete"] = False
            self._f = real_ntf(*a, **kw)

        @property
        def name(self):
            return self._f.name

        def write(self, data):
            return self._f.write(data)

        def flush(self):
            return self._f.flush()

        def __enter__(self):
            self._f.__enter__()
            return self

        def __exit__(self, *a):
            return self._f.__exit__(*a)

    import ingest.connectors.providers.gcp as _gcp_mod
    orig_ntf = _tf.NamedTemporaryFile
    orig_unlink = os.unlink

    captured_path = []
    unlinked = []

    def fake_ntf(*a, **kw):
        ntf = CapturingNTF(*a, **kw)
        captured_path.append(ntf.name)
        return ntf

    def fake_unlink(path):
        unlinked.append(path)
        try:
            orig_unlink(path)
        except FileNotFoundError:
            pass

    # Monkeypatch via module attribute replacement
    _gcp_mod._NamedTemporaryFile = fake_ntf
    _gcp_mod._os_unlink = fake_unlink
    try:
        # gcp.meter now raises on bq failure (contract: raise — run.py catches)
        with pytest.raises(RuntimeError):
            _gcp_mod.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=_gcp_run_bq_fail)
    finally:
        _gcp_mod._NamedTemporaryFile = orig_ntf
        _gcp_mod._os_unlink = orig_unlink

    # Key file must still have been unlinked (finally block)
    assert captured_path, "NamedTemporaryFile was never called"
    assert captured_path[0] in unlinked or not os.path.exists(captured_path[0]), \
        "GCP SA key tempfile was NOT deleted after bq failure"


def test_gcp_meter_missing_key_raises():
    """Missing GCP_BILLING_SA_JSON is a configuration error."""
    with pytest.raises(RuntimeError, match="GCP_BILLING_SA_JSON"):
        _gcp.meter({}, ["2026-04"], TODAY)


def test_gcp_meter_provider_slug():
    """Provider slug must be 'google'."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=_gcp_run_success)
    for r in rows:
        assert r["provider"] == "google"


def test_gcp_meter_zero_credits_excluded():
    """Month with credits_amount=0.00 must NOT produce a credit row."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-05"], TODAY, run_cmd=_gcp_run_success)
    credit_rows = [r for r in rows if r["credit_amount"] > 0 and r["month"] == "2026-05"]
    assert credit_rows == []


# ===========================================================================
# openai_.meter
# ===========================================================================

_OAI_CREDS = {"OPENAI_ADMIN_KEY": "sk-admin-test"}


def _make_oai_page(buckets_by_day, has_more=False, next_page=None):
    """Build a /v1/organization/costs page response.

    buckets_by_day: list of (start_time_epoch, amount)
    """
    data = [
        {
            "start_time": ts,
            "end_time": ts + 86400,
            "results": [{"amount": {"value": amt, "currency": "usd"}}],
        }
        for ts, amt in buckets_by_day
    ]
    d = {"data": data, "has_more": has_more}
    if next_page:
        d["next_page"] = next_page
    return d


# Epochs: 2026-04-15 and 2026-06-01 (UTC)
_APR15 = 1776211200   # 2026-04-15
_JUN01 = 1780272000   # 2026-06-01


def test_openai_meter_bucket_by_month(monkeypatch):
    """Daily buckets must be grouped into months."""
    page = _make_oai_page([(_APR15, 50.0), (_APR15 + 86400, 30.0), (_JUN01, 20.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    months = {r["month"] for r in rows}
    assert "2026-04" in months
    assert "2026-06" in months


def test_openai_meter_month_sum(monkeypatch):
    """Buckets in the same month are summed."""
    page = _make_oai_page([(_APR15, 50.0), (_APR15 + 86400, 30.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    apr = next((r for r in rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["credit_amount"] == pytest.approx(80.0, abs=0.01)


def test_openai_meter_credit_amount(monkeypatch):
    """Meter rows put grant usage into credit_amount."""
    page = _make_oai_page([(_APR15, 50.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    for r in rows:
        assert r["credit_amount"] > 0
        assert r["cash_amount"] == 0.0


def test_openai_meter_source_api(monkeypatch):
    """Meter rows must have source=api."""
    page = _make_oai_page([(_APR15, 50.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    for r in rows:
        assert r["source"] == "api"


def test_openai_meter_zero_month_excluded(monkeypatch):
    """Month with zero total cost must be excluded."""
    page = _make_oai_page([(_APR15, 0.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    assert rows == []


def test_openai_meter_missing_key_raises():
    """Missing OPENAI_ADMIN_KEY is a configuration error."""
    with pytest.raises(RuntimeError, match="OPENAI_ADMIN_KEY"):
        _oai.meter({}, ["2026-04"], TODAY)


def test_openai_meter_provider_slug(monkeypatch):
    """Provider slug must be 'openai'."""
    page = _make_oai_page([(_APR15, 10.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    for r in rows:
        assert r["provider"] == "openai"


# ===========================================================================
# Registry: METER populated and slugs canonical
# ===========================================================================

def test_meter_registry_populated():
    """METER must contain 7 entries after B5."""
    assert len(registry.METER) == 7


def test_meter_registry_slugs():
    """METER must contain all seven provider slugs."""
    slugs = {slug for slug, _ in registry.METER}
    for expected in ("deepinfra", "vast.ai", "ovhcloud", "fireworks", "aws", "google", "openai"):
        assert expected in slugs, f"METER missing: {expected}"


def test_meter_slugs_in_canonical():
    """All METER slugs must be in CANONICAL."""
    for slug, _ in registry.METER:
        assert slug in registry.CANONICAL, f"METER slug not in CANONICAL: {slug}"


def test_meter_callables():
    """All METER entries must be (str, callable) pairs."""
    for slug, fn in registry.METER:
        assert isinstance(slug, str)
        assert callable(fn)


# ===========================================================================
# Fix I2: meter connectors raise on auth/CLI breakage (contract: raise, run.py catches)
# ===========================================================================

def test_fireworks_meter_nonzero_rc_raises():
    """fireworks.meter: returncode != 0 → raises RuntimeError (not swallowed)."""
    fake_run = lambda cmd, **kw: _fake_result(stdout="", stderr="auth error", returncode=1)
    with pytest.raises(RuntimeError):
        _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)


def test_deepinfra_meter_http_error_propagates(monkeypatch):
    """deepinfra.meter: http_json raising propagates — not swallowed."""
    def raising_http(*a, **kw):
        raise OSError("connection refused")
    monkeypatch.setattr(_di, "http_json", raising_http)
    with pytest.raises(OSError):
        _di.meter(_DI_CREDS, ["2026-06"], TODAY)


def test_gcp_meter_auth_fail_raises():
    """gcp.meter: gcloud auth returncode != 0 → raises RuntimeError."""
    def auth_fail_run(cmd, **kw):
        if "gcloud" in cmd:
            return _fake_result(returncode=1)
        return _fake_result(returncode=0)
    with pytest.raises(RuntimeError):
        _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=auth_fail_run)


def test_gcp_meter_bq_fail_raises():
    """gcp.meter: bq returncode != 0 → raises RuntimeError."""
    def bq_fail_run(cmd, **kw):
        if "gcloud" in cmd:
            return _fake_result(returncode=0)
        return _fake_result(returncode=1)
    with pytest.raises(RuntimeError):
        _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=bq_fail_run)
