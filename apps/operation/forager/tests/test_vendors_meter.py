"""Hermetic tests for meter connectors (B5).

Connectors: azure, deepinfra, elevenlabs, ovh, vast, fireworks, gcp, openai_, openrouter, runpod.
All hermetic — http_json monkeypatched; run_cmd injected for CLI connectors.
No network, no SOPS, no real credentials.

Run: cd apps/operation/forager && python3 -m pytest tests/test_vendors_meter.py -q
"""
import json
import os
import sys
import tempfile
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import ingest.connectors.vendors.azure as _az
import ingest.connectors.vendors.deepinfra as _di
import ingest.connectors.vendors.elevenlabs as _el
import ingest.connectors.vendors.ovh as _ovh
import ingest.connectors.vendors.vast as _vast
import ingest.connectors.vendors.fireworks as _fw
import ingest.connectors.vendors.openai_ as _oai
import ingest.connectors.vendors.alibaba as _ali
import ingest.connectors.vendors.anthropic_ as _ant
import ingest.connectors.vendors.aws as _aws
import ingest.connectors.vendors.openrouter as _or
import ingest.connectors.vendors.runpod as _rp
import ingest.connectors.vendors.xai as _xai
import ingest.connectors.vendors.gcp as _gcp
import ingest.connectors.vendors.community as _comm
import ingest.connectors.vendors.cloudflare as _cf
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
    assert any(r["paid"] == pytest.approx(8.77, abs=0.001) for r in rows)


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


def test_deepinfra_meter_paid(monkeypatch):
    """Meter rows put paid usage into paid."""
    cap = Capture([{"months": [{"total_cost": 500, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows[0]["credit"] == 0.0
    assert rows[0]["paid"] == 5.0


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


def test_deepinfra_meter_vendor_slug(monkeypatch):
    """Vendor slug must be 'deepinfra'."""
    cap = Capture([{"months": [{"total_cost": 200, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert rows[0]["vendor"] == "deepinfra"


def test_deepinfra_meter_has_no_freshness_timestamp(monkeypatch):
    """Meter rows do not carry per-row freshness timestamps."""
    cap = Capture([{"months": [{"total_cost": 200, "period": "2026-04"}]}])
    monkeypatch.setattr(_di, "http_json", cap)
    rows = _di.meter(_DI_CREDS, ["2026-04"], TODAY)
    assert set(rows[0]) == {
        "month",
        "vendor",
        "currency",
        "category",
        "credit",
        "paid",
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
        "creationDate": "2026-05-01T10:00:00+00:00",
    }
    movement_voucher = {
        "type": "VOUCHER",
        "amount": {"value": "500.00"},
        "creationDate": "2026-05-01T10:00:00+00:00",
    }
    cap = Capture([movement_ids, movement_use, movement_voucher])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    # Only 1 row (the USE, as April usage billed May 1); VOUCHER ignored
    assert len(rows) == 1
    assert rows[0]["month"] == "2026-04"


def test_ovh_meter_usage_month_is_debit_month_minus_one(monkeypatch):
    """OVH debits the credit balance on the 1st for the PREVIOUS month's
    consumption — a Jul 1 movement is June usage, and a Jan 1 movement wraps
    to December of the prior year."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    movement_ids = [101, 102]
    july_first = {"type": "USE", "amount": {"value": "-40.00"},
                  "creationDate": "2026-07-01T00:00:00+00:00"}
    jan_first = {"type": "USE", "amount": {"value": "-10.00"},
                 "creationDate": "2026-01-01T00:00:00+00:00"}
    cap = Capture([movement_ids, july_first, jan_first])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2025-12", "2026-06"], TODAY)
    by_month = {r["month"]: r["credit"] for r in rows}
    assert by_month == {"2025-12": 10.0, "2026-06": 40.0}


def test_ovh_meter_native_eur(monkeypatch):
    """USE amount is kept in native EUR."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    movement_ids = [101]
    movement_use = {
        "type": "USE",
        "amount": {"value": "-100.00"},
        "creationDate": "2026-05-01T10:00:00+00:00",
    }
    cap = Capture([movement_ids, movement_use])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    assert rows[0]["credit"] == pytest.approx(100.0, abs=0.01)
    assert rows[0]["paid"] == 0.0
    assert rows[0]["currency"] == "EUR"


def test_ovh_meter_credit(monkeypatch):
    """Meter rows put credit burn into credit."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([[101], {"type": "USE", "amount": {"value": "-50.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04"], TODAY)
    assert rows[0]["credit"] == 50.0


def test_ovh_meter_source_api(monkeypatch):
    """Meter rows must have source=api."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([[101], {"type": "USE", "amount": {"value": "-50.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04"], TODAY)
    assert rows[0]["source"] == "api"


def test_ovh_meter_month_grouping(monkeypatch):
    """Multiple USE movements debited the same day are summed into one row."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    movement_ids = [101, 102]
    m1 = {"type": "USE", "amount": {"value": "-30.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}
    m2 = {"type": "USE", "amount": {"value": "-20.00"}, "creationDate": "2026-05-01T00:00:00+00:00"}
    cap = Capture([movement_ids, m1, m2])
    monkeypatch.setattr(_ovh, "http_json", cap)
    rows = _ovh.meter(_OVH_CREDS, ["2026-04"], TODAY)
    assert len(rows) == 1
    assert rows[0]["credit"] == pytest.approx(50.0, abs=0.01)


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
        assert r["vendor"] == "vast.ai"
    # No negative or implausibly large amounts from deposits
    for r in rows:
        assert r["paid"] < 200.0


def test_vast_meter_grouped_by_month():
    """Multiple charge rows in same month are summed."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=fake_run)
    apr = next((r for r in rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["paid"] == pytest.approx(70.0, abs=0.01)  # 50 + 20


def test_vast_meter_paid():
    """Meter rows put paid usage into paid."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["credit"] == 0.0
        assert r["paid"] > 0


def test_vast_meter_source_cli():
    """Meter rows must have source=cli."""
    fake_run = lambda cmd, **kw: _fake_result(stdout=_VAST_INVOICES_JSON)
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    for r in rows:
        assert r["source"] == "cli"


def test_vast_meter_cli_command():
    """Must call vastai show invoices --raw with an explicit date window —
    without -s/-e the CLI silently returns TODAY only (lost months of history).
    The end extends past TODAY (not just past the requested months) because
    rollups covering a month can be POSTED weeks later."""
    cmds = []
    fake_run = lambda cmd, **kw: (cmds.append(cmd), _fake_result(stdout=_VAST_INVOICES_JSON))[1]
    _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    assert cmds[0] == ["vastai", "show", "invoices", "--raw",
                       "-s", "2026-04-01", "-e", "2026-07-04"]


def test_vast_meter_window_spans_all_months():
    """Window = first day of min month → first day after max month (when that
    is already past today+1)."""
    cmds = []
    fake_run = lambda cmd, **kw: (cmds.append(cmd), _fake_result(stdout="[]"))[1]
    _vast.meter(_VAST_CREDS, ["2026-01", "2026-07", "2026-12"], TODAY, run_cmd=fake_run)
    assert cmds[0][cmds[0].index("-s") + 1] == "2026-01-01"
    assert cmds[0][cmds[0].index("-e") + 1] == "2027-01-01"


def test_vast_meter_spreads_rollups_across_usage_months():
    """A rollup charge covers [timestamp − quantity hours, timestamp]; its
    amount splits across months by overlap. 480h ending 2026-04-10 00:00 UTC
    = 2026-03-21 → 2026-04-10: 11 of 20 days in March, 9 in April."""
    rollup = json.dumps([{
        "type": "charge", "timestamp": 1775779200,  # 2026-04-10 00:00:00 UTC
        "amount": "100.0", "quantity": "480.0", "rate": "0.2083",
    }])
    fake_run = lambda cmd, **kw: _fake_result(stdout=rollup)
    rows = _vast.meter(_VAST_CREDS, ["2026-03", "2026-04"], TODAY, run_cmd=fake_run)
    by_month = {r["month"]: r["paid"] for r in rows}
    assert by_month["2026-03"] == pytest.approx(55.0, abs=0.01)
    assert by_month["2026-04"] == pytest.approx(45.0, abs=0.01)


def test_vast_meter_spread_parts_outside_requested_months_dropped():
    """Only requested months appear even when the covered window reaches
    further back."""
    rollup = json.dumps([{
        "type": "charge", "timestamp": 1775779200,  # 2026-04-10 00:00:00 UTC
        "amount": "100.0", "quantity": "480.0", "rate": "0.2083",
    }])
    fake_run = lambda cmd, **kw: _fake_result(stdout=rollup)
    rows = _vast.meter(_VAST_CREDS, ["2026-04"], TODAY, run_cmd=fake_run)
    assert [r["month"] for r in rows] == ["2026-04"]
    assert rows[0]["paid"] == pytest.approx(45.0, abs=0.01)


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

_FW_CREDS = {
    "FIREWORKS_API_KEY": "fw-poll",
    "FIREWORKS_API_KEY_MYCELI": "fw-myceli",
    "FIREWORKS_API_KEY_NEO_GLYPH": "fw-neo",
    "FIREWORKS_API_KEY_PIXELMARKET": "fw-pix",
}

_FW_NO_INVOICES = "ID  AMOUNT  TYPE  INVOICE URL  STATE  TARGET TIME  PAID TIME\n"


def _fw_costs(total):
    """A get-usage --account-costs-only JSON body with the given month total.

    Mirrors the real proto-JSON Money shape: int64 units as a string, nanos
    as an int, both omitted when zero.
    """
    units, cents = int(total), round((total - int(total)) * 100)
    money = {"currency_code": "USD"}
    if units:
        money["units"] = str(units)
    if cents:
        money["nanos"] = cents * 10_000_000
    return json.dumps({"account_costs": {"cost_data_items": [{"total": money}]}})


def _fw_invoice(amount, target, kind="POSTPAID_BILLING", state="PAID"):
    return (
        f"SoMeInVoIcEiDxx  {amount:.2f}  USD  {kind}"
        f"  https://invoices.withorb.com/view?token=X  {state}"
        f"  {target}  02:00:00  2026-07-02  07:24:50\n"
    )


class _FwRun:
    """run_cmd fake: per-(key, month) usage + per-key invoice ledgers."""

    def __init__(self, usage=None, invoices=None):
        self.usage = usage or {}
        self.invoices = invoices or {}
        self.calls = []

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        key = cmd[cmd.index("--api-key") + 1]
        if "list-invoices" in cmd:
            return _fake_result(
                stdout=_FW_NO_INVOICES + self.invoices.get(key, "")
            )
        month = cmd[cmd.index("--start-time") + 1][:7]
        return _fake_result(stdout=_fw_costs(self.usage.get((key, month), 0.0)))


def test_fireworks_waterfall_credit_until_the_invoice_anchor():
    """Grant months are credit; the invoice month fixes cash and closes the
    grant; later consumption is our money (prepaid balance)."""
    run = _FwRun(
        usage={
            ("fw-poll", "2026-04"): 2000.0,
            ("fw-poll", "2026-05"): 3000.0,
            ("fw-poll", "2026-06"): 7000.0,
            ("fw-poll", "2026-07"): 300.0,
        },
        # invoice cut 2026-07-01 covers June usage
        invoices={"fw-poll": _fw_invoice(2432.84, "2026-07-01")},
    )
    rows = _fw.meter(
        _FW_CREDS, ["2026-04", "2026-05", "2026-06", "2026-07"], TODAY, run_cmd=run
    )
    by_month = {}
    for r in rows:
        entry = by_month.setdefault(r["month"], {"credit": 0.0, "paid": 0.0})
        entry["credit"] += r["credit"]
        entry["paid"] += r["paid"]

    assert by_month["2026-04"] == {"credit": 2000.0, "paid": 0.0}
    assert by_month["2026-05"] == {"credit": 3000.0, "paid": 0.0}
    assert by_month["2026-06"] == {"credit": 4567.16, "paid": 2432.84}
    assert by_month["2026-07"] == {"credit": 0.0, "paid": 300.0}
    assert all(r["vendor"] == "fireworks" and r["source"] == "cli" for r in rows)


def test_fireworks_meter_sums_accounts_per_month():
    run = _FwRun(
        usage={
            ("fw-poll", "2026-04"): 100.0,
            ("fw-myceli", "2026-04"): 50.0,
            ("fw-neo", "2026-04"): 25.0,
        },
    )
    rows = _fw.meter(_FW_CREDS, ["2026-04"], TODAY, run_cmd=run)
    assert len(rows) == 1
    assert rows[0]["credit"] == 175.0 and rows[0]["paid"] == 0.0


def test_fireworks_scoped_month_still_replays_grant_history():
    """--month runs must not restart the waterfall: July after an exhausting
    invoice is paid, even when only July is requested."""
    run = _FwRun(
        usage={
            ("fw-poll", "2026-06"): 7000.0,
            ("fw-poll", "2026-07"): 300.0,
        },
        invoices={"fw-poll": _fw_invoice(500.0, "2026-07-01")},
    )
    rows = _fw.meter(_FW_CREDS, ["2026-07"], TODAY, run_cmd=run)
    assert len(rows) == 1
    assert rows[0]["month"] == "2026-07"
    assert rows[0]["paid"] == 300.0 and rows[0]["credit"] == 0.0


def test_fireworks_prepaid_and_draft_invoices_are_not_cash_anchors():
    run = _FwRun(
        usage={("fw-poll", "2026-06"): 100.0},
        invoices={
            "fw-poll": (
                _fw_invoice(99.0, "2026-07-01", kind="PREPAID_CREDITS")
                + _fw_invoice(88.0, "2026-07-01", state="DRAFT")
                + _fw_invoice(0.0, "2026-07-01")
            )
        },
    )
    rows = _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=run)
    assert len(rows) == 1
    assert rows[0]["credit"] == 100.0 and rows[0]["paid"] == 0.0


def test_fireworks_meter_zero_months_emit_nothing():
    run = _FwRun()
    assert _fw.meter(_FW_CREDS, ["2026-05"], TODAY, run_cmd=run) == []


def test_fireworks_meter_windows_clamp_the_running_month():
    """Full [1st, next 1st) usage windows; the running month ends tomorrow."""
    run = _FwRun()
    _fw.meter(_FW_CREDS, ["2026-06", "2026-07"], TODAY, run_cmd=run)  # TODAY 2026-07-03
    windows = {
        (c[c.index("--start-time") + 1], c[c.index("--end-time") + 1])
        for c in run.calls
        if "get-usage" in c
    }
    assert ("2026-06-01", "2026-07-01") in windows
    assert ("2026-07-01", "2026-07-04") in windows


def test_fireworks_meter_missing_keys_raise_without_values():
    with pytest.raises(RuntimeError) as err:
        _fw.meter({"FIREWORKS_API_KEY": "fw-poll"}, ["2026-06"], TODAY)
    message = str(err.value)
    assert "FIREWORKS_API_KEY_MYCELI" in message
    assert "fw-poll" not in message


def test_fireworks_meter_cli_failure_raises():
    fake_run = lambda cmd, **kw: _fake_result(returncode=1, stderr="SECRET")
    with pytest.raises(RuntimeError, match="failed"):
        _fw.meter(_FW_CREDS, ["2026-06"], TODAY, run_cmd=fake_run)


# ===========================================================================
# azure.meter
# ===========================================================================

_AZ_CREDS = {
    "AZURE_TENANT_ID": "tenant-guid",
    "AZURE_CLIENT_ID": "client-guid",
    "AZURE_CLIENT_SECRET": "sp-secret",
    "AZURE_BILLING_ACCOUNT": "acct-guid:profile-guid_2019-05-31",
    "AZURE_BILLING_PROFILE": "XXXX-YYYY-ZZZ-PGB",
}

_AZ_TOKEN = {"access_token": "az-tok", "expires_in": 3599}


def _az_invoice(start, end, billed, credit):
    """Invoice payload shaped like the live 2024-04-01 API response."""
    return {
        "name": "G000000000",
        "properties": {
            "invoicePeriodStartDate": f"{start}T00:00:00.0000000Z",
            "invoicePeriodEndDate": f"{end}T23:59:59.9999999Z",
            "billedAmount": {"value": billed, "currency": "EUR"},
            "creditAmount": {"value": credit, "currency": "EUR"},
        },
    }


def test_azure_meter_credit_and_cash_split(monkeypatch):
    """Sponsored month: credit row = |creditAmount|, cash = billed + credit."""
    invoices = {"value": [_az_invoice("2026-04-01", "2026-04-30", 1527.99, -1471.33)]}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    rows = _az.meter(_AZ_CREDS, ["2026-04"], TODAY)
    assert len(rows) == 2
    credit = next(r for r in rows if r["credit"] > 0)
    cash = next(r for r in rows if r["paid"] > 0)
    assert credit["credit"] == pytest.approx(1471.33)
    assert cash["paid"] == pytest.approx(56.66, abs=0.005)
    for r in rows:
        assert r["vendor"] == "azure"
        assert r["currency"] == "EUR"
        assert r["source"] == "api"
        assert r["month"] == "2026-04"


def test_azure_meter_precredit_month_cash_only(monkeypatch):
    """Jan–Mar (no active credit lot): whole invoice is a card charge."""
    invoices = {"value": [_az_invoice("2026-01-01", "2026-01-31", 10994.45, 0.0)]}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    rows = _az.meter(_AZ_CREDS, ["2026-01"], TODAY)
    assert len(rows) == 1
    assert rows[0]["paid"] == pytest.approx(10994.45)
    assert rows[0]["credit"] == 0.0


def test_azure_meter_skips_partial_period_invoices(monkeypatch):
    """Zero-billed one-day invoices (purchase receipts) must not emit rows."""
    invoices = {"value": [
        _az_invoice("2026-04-08", "2026-04-08", 0.0, 0.0),
        _az_invoice("2026-04-11", "2026-04-11", 0.0, 0.0),
    ]}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    assert _az.meter(_AZ_CREDS, ["2026-04"], TODAY) == []


def test_azure_meter_running_month_has_no_row(monkeypatch):
    """No invoice for the running month yet → no row (arrives ~day 9 of m+1)."""
    invoices = {"value": [_az_invoice("2026-05-01", "2026-05-31", 3362.45, -3200.76)]}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    rows = _az.meter(_AZ_CREDS, ["2026-05", "2026-06", "2026-07"], TODAY)
    assert {r["month"] for r in rows} == {"2026-05"}


def test_azure_meter_out_of_scope_month_skipped(monkeypatch):
    """Invoices outside the requested months must not emit rows."""
    invoices = {"value": [
        _az_invoice("2026-01-01", "2026-01-31", 10994.45, 0.0),
        _az_invoice("2026-05-01", "2026-05-31", 3362.45, -3200.76),
    ]}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    rows = _az.meter(_AZ_CREDS, ["2026-05"], TODAY)
    assert {r["month"] for r in rows} == {"2026-05"}


def test_azure_meter_paginates_nextlink(monkeypatch):
    """value pages joined via nextLink."""
    page1 = {
        "value": [_az_invoice("2026-01-01", "2026-01-31", 100.0, 0.0)],
        "nextLink": "https://management.azure.com/next-page",
    }
    page2 = {"value": [_az_invoice("2026-02-01", "2026-02-28", 200.0, 0.0)]}
    cap = Capture([_AZ_TOKEN, page1, page2])
    monkeypatch.setattr(_az, "http_json", cap)
    rows = _az.meter(_AZ_CREDS, ["2026-01", "2026-02"], TODAY)
    assert {r["month"] for r in rows} == {"2026-01", "2026-02"}
    assert cap.calls[2]["url"] == "https://management.azure.com/next-page"


def test_azure_meter_token_then_invoices(monkeypatch):
    """First call = client-credentials POST; second = invoices GET with bearer."""
    invoices = {"value": []}
    cap = Capture([_AZ_TOKEN, invoices])
    monkeypatch.setattr(_az, "http_json", cap)
    _az.meter(_AZ_CREDS, ["2026-04"], TODAY)
    assert "login.microsoftonline.com/tenant-guid" in cap.calls[0]["url"]
    assert b"client_credentials" in cap.calls[0]["data"]
    assert cap.calls[1]["headers"]["Authorization"] == "Bearer az-tok"
    # billing account contains ':' — must be percent-encoded in the path
    assert "acct-guid%3Aprofile-guid_2019-05-31" in cap.calls[1]["url"]


def test_azure_meter_missing_creds_raise():
    with pytest.raises(RuntimeError, match="AZURE_CLIENT_SECRET"):
        _az.meter({k: v for k, v in _AZ_CREDS.items() if k != "AZURE_CLIENT_SECRET"},
                  ["2026-04"], TODAY)


# ===========================================================================
# openrouter.meter
# ===========================================================================

_OR_CREDS = {"OPENROUTER_MANAGEMENT_API_KEY": "or-mgmt-key"}


def _or_activity(*day_usage):
    """Activity payload: (date, usage) pairs, one model row per day."""
    return {"data": [
        {"date": f"{day} 00:00:00", "model": "test/model", "usage": usage}
        for day, usage in day_usage
    ]}


def test_openrouter_meter_sums_days_by_month(monkeypatch):
    cap = Capture([_or_activity(
        ("2026-06-01", 10.0), ("2026-06-20", 5.5), ("2026-07-01", 2.25),
    )])
    monkeypatch.setattr(_or, "http_json", cap)
    rows = _or.meter(_OR_CREDS, ["2026-06", "2026-07"], TODAY)
    assert {r["month"]: r["credit"] for r in rows} == {"2026-06": 15.5, "2026-07": 2.25}
    for r in rows:
        assert r["vendor"] == "openrouter"
        assert r["paid"] == 0.0
        assert r["source"] == "api"


def test_openrouter_meter_skips_window_truncated_month(monkeypatch):
    """A month the ~30-day window cannot cover from day 1 must NOT emit a
    partial (understated) row — history lives as manual rows instead."""
    cap = Capture([_or_activity(("2026-06-06", 10.0), ("2026-07-01", 2.0))])
    monkeypatch.setattr(_or, "http_json", cap)
    rows = _or.meter(_OR_CREDS, ["2026-05", "2026-06", "2026-07"], TODAY)
    assert {r["month"] for r in rows} == {"2026-07"}


def test_openrouter_meter_covered_month_from_first_day(monkeypatch):
    """Window reaching a month's first day makes that month emittable."""
    cap = Capture([_or_activity(("2026-06-01", 3.0), ("2026-06-15", 4.0))])
    monkeypatch.setattr(_or, "http_json", cap)
    rows = _or.meter(_OR_CREDS, ["2026-06"], TODAY)
    assert rows[0]["credit"] == 7.0


def test_openrouter_meter_out_of_scope_month_skipped(monkeypatch):
    cap = Capture([_or_activity(("2026-07-01", 2.0), ("2026-07-02", 3.0))])
    monkeypatch.setattr(_or, "http_json", cap)
    rows = _or.meter(_OR_CREDS, ["2026-06"], TODAY)
    assert rows == []


def test_openrouter_meter_empty_activity(monkeypatch):
    cap = Capture([{"data": []}])
    monkeypatch.setattr(_or, "http_json", cap)
    assert _or.meter(_OR_CREDS, ["2026-07"], TODAY) == []


def test_openrouter_meter_missing_key_raises():
    with pytest.raises(RuntimeError, match="OPENROUTER_MANAGEMENT_API_KEY"):
        _or.meter({}, ["2026-07"], TODAY)


def test_openrouter_meter_uses_management_key(monkeypatch):
    cap = Capture([{"data": []}])
    monkeypatch.setattr(_or, "http_json", cap)
    _or.meter(_OR_CREDS, ["2026-07"], TODAY)
    assert cap.calls[0]["headers"]["Authorization"] == "Bearer or-mgmt-key"



# ===========================================================================
# runpod.meter
# ===========================================================================

_RP_CREDS = {"RUNPOD_API_KEY": "rpa-read-key"}


def _rp_responses(pods=(), endpoints=(), volumes=()):
    """One response per billing surface, in _SURFACES order.

    pods/endpoints rows carry `time`; networkvolumes rows carry `startDate`.
    """
    return [
        [{"time": t, "amount": a, "podId": "p1"} for t, a in pods],
        [{"time": t, "amount": a, "endpointId": "e1"} for t, a in endpoints],
        [{"startDate": t, "amount": a} for t, a in volumes],
    ]


def test_runpod_meter_sums_three_surfaces_credit_era(monkeypatch):
    """Grant-era months (waterfall not yet exhausted) land as credit."""
    cap = Capture(_rp_responses(
        pods=[("2026-03-01", 2.87), ("2026-04-01", 1069.24)],
        endpoints=[("2026-04-01", 115.36)],
        volumes=[("2026-04-01", 6.25)],
    ))
    monkeypatch.setattr(_rp, "http_json", cap)
    rows = _rp.meter(_RP_CREDS, ["2026-03", "2026-04"], TODAY)
    assert {r["month"]: r["credit"] for r in rows} == {
        "2026-03": 2.87, "2026-04": 1190.85,
    }
    for r in rows:
        assert r["vendor"] == "runpod"
        assert r["paid"] == 0.0
        assert r["source"] == "api"
        assert r["currency"] == "USD"


def test_runpod_meter_waterfall_splits_cutover_month(monkeypatch):
    """June 2026: the $2,500 code dies mid-month → credit remnant + paid rest.
    The waterfall replays from March even when June alone is requested."""
    cap = Capture(_rp_responses(
        pods=[("2026-03-01", 2.87), ("2026-04-01", 1190.85),
              ("2026-05-01", 1224.36), ("2026-06-01", 981.32),
              ("2026-07-01", 221.82)],
    ))
    monkeypatch.setattr(_rp, "http_json", cap)
    rows = _rp.meter(_RP_CREDS, ["2026-06", "2026-07"], TODAY)
    by_month = {}
    for r in rows:
        entry = by_month.setdefault(r["month"], {"credit": 0.0, "paid": 0.0})
        entry["credit"] += r["credit"]
        entry["paid"] += r["paid"]
    assert by_month == {
        "2026-06": {"credit": 81.92, "paid": 899.4},
        "2026-07": {"credit": 0.0, "paid": 221.82},
    }


def test_runpod_meter_window_spans_grant_era_and_auth(monkeypatch):
    """Window always reaches back to MONTHS_START so the waterfall is replayed."""
    cap = Capture(_rp_responses())
    monkeypatch.setattr(_rp, "http_json", cap)
    _rp.meter(_RP_CREDS, ["2026-06"], TODAY)
    assert len(cap.calls) == 3
    for call, surface in zip(cap.calls, ("pods", "endpoints", "networkvolumes")):
        assert f"/billing/{surface}?" in call["url"]
        assert "bucketSize=month" in call["url"]
        assert "startTime=2026-03-01T00:00:00Z" in call["url"]
        assert "endTime=2026-07-01T00:00:00Z" in call["url"]
        assert call["headers"]["Authorization"] == "Bearer rpa-read-key"


def test_runpod_meter_networkvolumes_startdate_key(monkeypatch):
    cap = Capture(_rp_responses(volumes=[("2026-04-01", 6.25)]))
    monkeypatch.setattr(_rp, "http_json", cap)
    rows = _rp.meter(_RP_CREDS, ["2026-04"], TODAY)
    assert rows[0]["credit"] == 6.25


def test_runpod_meter_out_of_scope_month_skipped(monkeypatch):
    cap = Capture(_rp_responses(pods=[("2026-03-01", 2.87)]))
    monkeypatch.setattr(_rp, "http_json", cap)
    assert _rp.meter(_RP_CREDS, ["2026-04"], TODAY) == []


def test_runpod_meter_zero_month_excluded(monkeypatch):
    cap = Capture(_rp_responses(pods=[("2026-04-01", 0.0)]))
    monkeypatch.setattr(_rp, "http_json", cap)
    assert _rp.meter(_RP_CREDS, ["2026-04"], TODAY) == []


def test_runpod_meter_december_window_rolls_year(monkeypatch):
    cap = Capture(_rp_responses())
    monkeypatch.setattr(_rp, "http_json", cap)
    _rp.meter(_RP_CREDS, ["2026-12"], TODAY)
    assert "endTime=2027-01-01T00:00:00Z" in cap.calls[0]["url"]


def test_runpod_meter_missing_key_raises():
    with pytest.raises(RuntimeError, match="RUNPOD_API_KEY"):
        _rp.meter({}, ["2026-07"], TODAY)



# ===========================================================================
# alibaba.meter
# ===========================================================================

def _ali_overview(items):
    return _fake_result(stdout=json.dumps({
        "Code": "Success",
        "Data": {"Items": {"Item": items}},
    }))


def _ali_runner(results):
    calls = []
    seq = list(results)

    def run_cmd(args, capture_output=True, text=True, timeout=60):
        calls.append(args)
        return seq.pop(0)
    run_cmd.calls = calls
    return run_cmd


def test_alibaba_meter_books_discounts_as_lower_paid_cost(monkeypatch):
    run_cmd = _ali_runner([_ali_overview([
        {"PretaxGrossAmount": 1509.19, "InvoiceDiscount": 285.10,
         "DeductedByCoupons": 1000.00, "PretaxAmount": 224.08},
    ])])
    rows = _ali.meter({}, ["2026-03"], TODAY, run_cmd=run_cmd)
    assert len(rows) == 1
    assert rows[0]["credit"] == 0.0
    assert rows[0]["paid"] == 224.08
    for r in rows:
        assert r["vendor"] == "alibaba"
        assert r["currency"] == "USD"
        assert r["source"] == "cli"


def test_alibaba_meter_month_per_call_argv(monkeypatch):
    run_cmd = _ali_runner([_ali_overview([]), _ali_overview([])])
    _ali.meter({}, ["2026-05", "2026-04"], TODAY, run_cmd=run_cmd)
    assert run_cmd.calls[0][:3] == ["aliyun", "bssopenapi", "QueryBillOverview"]
    assert "--BillingCycle" in run_cmd.calls[0]
    assert run_cmd.calls[0][run_cmd.calls[0].index("--BillingCycle") + 1] == "2026-04"
    assert run_cmd.calls[1][run_cmd.calls[1].index("--BillingCycle") + 1] == "2026-05"
    assert "-p" in run_cmd.calls[0]  # profile auth, no key in argv


def test_alibaba_meter_zero_month_emits_nothing(monkeypatch):
    run_cmd = _ali_runner([_ali_overview([{"PretaxAmount": 0}])])
    assert _ali.meter({}, ["2026-07"], TODAY, run_cmd=run_cmd) == []


def test_alibaba_meter_non_success_code_raises(monkeypatch):
    run_cmd = _ali_runner([_fake_result(stdout='{"Code": "Throttling"}')])
    with pytest.raises(RuntimeError, match="code=Throttling"):
        _ali.meter({}, ["2026-06"], TODAY, run_cmd=run_cmd)


def test_alibaba_meter_cli_failure_raises(monkeypatch):
    run_cmd = _ali_runner([_fake_result(returncode=1)])
    with pytest.raises(RuntimeError, match="rc=1"):
        _ali.meter({}, ["2026-06"], TODAY, run_cmd=run_cmd)


# ===========================================================================
# xai.meter
# ===========================================================================

_XAI_CREDS = {"XAI_MANAGEMENT_API_KEY": "xai-token-test"}
_XAI_TEAMS = {"teams": [{"teamId": "team-1"}]}


def _xai_invoice(create_time, lines):
    return {"createTime": create_time, "lines": lines}


def _xai_usage_line(cents):
    return {"unitType": "Generated image", "amount": str(cents)}


_XAI_PREPAID_LINE = {"unitType": "prepaid_tokens", "amount": "20000"}


def test_xai_meter_cycle_invoices_bill_previous_month(monkeypatch):
    cap = Capture([_XAI_TEAMS, {"invoices": [
        _xai_invoice("2026-04-05T19:40:05Z", [_xai_usage_line(30854)]),
        _xai_invoice("2026-05-03T14:42:21Z", [_xai_usage_line(30000), _xai_usage_line(25231)]),
    ]}])
    monkeypatch.setattr(_xai, "http_json", cap)
    rows = _xai.meter(_XAI_CREDS, ["2026-03", "2026-04"], TODAY)
    assert {r["month"]: r["paid"] for r in rows} == {
        "2026-03": 308.54, "2026-04": 552.31,
    }
    for r in rows:
        assert r["vendor"] == "xai"
        assert r["credit"] == 0.0
        assert r["source"] == "api"


def test_xai_meter_excludes_prepaid_topups(monkeypatch):
    cap = Capture([_XAI_TEAMS, {"invoices": [
        _xai_invoice("2026-06-26T14:02:56Z", [_XAI_PREPAID_LINE]),
        _xai_invoice("2026-06-04T20:01:02Z", [_xai_usage_line(32230)]),
    ]}])
    monkeypatch.setattr(_xai, "http_json", cap)
    rows = _xai.meter(_XAI_CREDS, ["2026-05"], TODAY)
    assert [(r["month"], r["paid"]) for r in rows] == [("2026-05", 322.3)]


def test_xai_meter_team_autodiscovery_and_auth(monkeypatch):
    cap = Capture([_XAI_TEAMS, {"invoices": []}])
    monkeypatch.setattr(_xai, "http_json", cap)
    _xai.meter(_XAI_CREDS, ["2026-06"], TODAY)
    assert cap.calls[0]["url"].endswith("/auth/teams")
    assert "/v1/billing/teams/team-1/invoices" in cap.calls[1]["url"]
    assert cap.calls[0]["headers"]["Authorization"] == "Bearer xai-token-test"


def test_xai_meter_multiple_teams_raises(monkeypatch):
    cap = Capture([{"teams": [{"teamId": "a"}, {"teamId": "b"}]}])
    monkeypatch.setattr(_xai, "http_json", cap)
    with pytest.raises(RuntimeError, match="exactly one team"):
        _xai.meter(_XAI_CREDS, ["2026-06"], TODAY)


def test_xai_meter_january_cycle_rolls_year(monkeypatch):
    cap = Capture([_XAI_TEAMS, {"invoices": [
        _xai_invoice("2027-01-05T00:00:00Z", [_xai_usage_line(1000)]),
    ]}])
    monkeypatch.setattr(_xai, "http_json", cap)
    rows = _xai.meter(_XAI_CREDS, ["2026-12"], TODAY)
    assert rows[0]["month"] == "2026-12"


def test_xai_meter_missing_key_raises():
    with pytest.raises(RuntimeError, match="XAI_MANAGEMENT_API_KEY"):
        _xai.meter({}, ["2026-07"], TODAY)


# ===========================================================================
# anthropic_.meter
# ===========================================================================

_ANT_CREDS = {"ANTHROPIC_ADMIN_KEY": "sk-ant-admin-test"}


def _ant_month(cents_amounts):
    """Cost-report response for one month window (amounts in cents)."""
    return {
        "data": [
            {"starting_at": "x", "results": [{"amount": str(c)}]}
            for c in cents_amounts
        ],
        "has_more": False,
    }


def _ant_year(**month_cents):
    """Responses for the 7 month windows Jan..Jul (TODAY is 2026-07)."""
    return [
        _ant_month(month_cents.get(f"m{i:02d}", []))
        for i in range(1, 8)
    ]


def test_anthropic_meter_waterfall_splits_cutover_month(monkeypatch):
    """$5k grant from Feb: credit until exhausted, cash after — the cutover
    month splits. The waterfall replays from January even for scoped
    month requests."""
    cap = Capture(_ant_year(
        m01=[100000], m02=[300000], m03=[150000, 100000], m04=[20000],
    ))
    monkeypatch.setattr(_ant, "http_json", cap)
    rows = _ant.meter(_ANT_CREDS, ["2026-03", "2026-04"], TODAY)
    by_month = {}
    for r in rows:
        entry = by_month.setdefault(r["month"], {"credit": 0.0, "paid": 0.0})
        entry["credit"] += r["credit"]
        entry["paid"] += r["paid"]
    assert by_month == {
        "2026-03": {"credit": 2000.0, "paid": 500.0},
        "2026-04": {"credit": 0.0, "paid": 200.0},
    }
    for r in rows:
        assert r["vendor"] == "anthropic"
        assert r["source"] == "api"
        assert r["currency"] == "USD"


def test_anthropic_meter_cents_to_usd_and_pre_grant_cash(monkeypatch):
    """January predates the grant (auto-recharge era) — cash, and cents→USD."""
    cap = Capture(_ant_year(m01=[186500]))
    monkeypatch.setattr(_ant, "http_json", cap)
    rows = _ant.meter(_ANT_CREDS, ["2026-01"], TODAY)
    assert rows[0]["paid"] == 1865.0
    assert rows[0]["credit"] == 0.0


def test_anthropic_meter_month_windows_and_auth(monkeypatch):
    cap = Capture(_ant_year())
    monkeypatch.setattr(_ant, "http_json", cap)
    _ant.meter(_ANT_CREDS, ["2026-06"], TODAY)
    assert len(cap.calls) == 7
    first = cap.calls[0]
    assert "starting_at=2026-01-01T00:00:00Z" in first["url"]
    assert "ending_at=2026-02-01T00:00:00Z" in first["url"]
    assert first["headers"]["x-api-key"] == "sk-ant-admin-test"
    assert first["headers"]["anthropic-version"] == "2023-06-01"


def test_anthropic_meter_zero_months_emit_nothing(monkeypatch):
    cap = Capture(_ant_year(m01=[100]))
    monkeypatch.setattr(_ant, "http_json", cap)
    assert _ant.meter(_ANT_CREDS, ["2026-05"], TODAY) == []


def test_anthropic_meter_missing_key_raises():
    with pytest.raises(RuntimeError, match="ANTHROPIC_ADMIN_KEY"):
        _ant.meter({}, ["2026-07"], TODAY)


# ===========================================================================
# elevenlabs.meter
# ===========================================================================

_EL_CREDS = {"ELEVENLABS_API_KEY": "xi-admin-key"}


def _el_analytics(*day_cost):
    """Columnar analytics payload shaped like the live endpoint."""
    return {
        "columns": ["timestamp", "total_usage", "total_minutes", "total_cost",
                    "usage_count", "total_charge_count"],
        "rows": [[f"{day}T00:00:00Z", 0, 0.0, cost, 0, 0.0] for day, cost in day_cost],
    }


def test_elevenlabs_meter_sums_days_by_month(monkeypatch):
    cap = Capture([_el_analytics(("2026-02-01", 900.0), ("2026-02-02", 54.0), ("2026-03-01", 5.0))])
    monkeypatch.setattr(_el, "http_json", cap)
    rows = _el.meter(_EL_CREDS, ["2026-02", "2026-03"], TODAY)
    assert {r["month"]: r["credit"] for r in rows} == {"2026-02": 954.0, "2026-03": 5.0}
    for r in rows:
        assert r["vendor"] == "elevenlabs"
        assert r["source"] == "api"
        assert r["currency"] == "USD"


def test_elevenlabs_meter_grant_waterfall(monkeypatch):
    """The $3,300 grant runs dry mid-April: Feb+Mar full credit, April splits
    credit/cash, May onward is all cash."""
    cap = Capture([_el_analytics(
        ("2026-02-10", 954.0),
        ("2026-03-10", 1821.77),
        ("2026-04-10", 1169.71),
        ("2026-05-10", 226.74),
    )])
    monkeypatch.setattr(_el, "http_json", cap)
    rows = _el.meter(_EL_CREDS, ["2026-02", "2026-03", "2026-04", "2026-05"], TODAY)
    by = {(r["month"], "credit" if r["credit"] else "paid"): r for r in rows}
    assert by[("2026-02", "credit")]["credit"] == 954.0
    assert by[("2026-03", "credit")]["credit"] == 1821.77
    assert by[("2026-04", "credit")]["credit"] == pytest.approx(524.23, abs=0.01)
    assert by[("2026-04", "paid")]["paid"] == pytest.approx(645.48, abs=0.01)
    assert by[("2026-05", "paid")]["paid"] == 226.74
    assert ("2026-05", "credit") not in by


def test_elevenlabs_meter_waterfall_replays_on_scoped_runs(monkeypatch):
    """A run scoped to May must still see the grant exhausted by Feb–Apr —
    the waterfall walks from MONTHS_START regardless of requested months."""
    cap = Capture([_el_analytics(
        ("2026-02-10", 954.0),
        ("2026-03-10", 1821.77),
        ("2026-04-10", 1169.71),
        ("2026-05-10", 226.74),
    )])
    monkeypatch.setattr(_el, "http_json", cap)
    rows = _el.meter(_EL_CREDS, ["2026-05"], TODAY)
    assert len(rows) == 1
    assert rows[0]["paid"] == 226.74
    assert rows[0]["credit"] == 0.0


def test_elevenlabs_meter_zero_months_excluded(monkeypatch):
    cap = Capture([_el_analytics(("2026-01-05", 0.0))])
    monkeypatch.setattr(_el, "http_json", cap)
    assert _el.meter(_EL_CREDS, ["2026-01"], TODAY) == []


def test_elevenlabs_meter_body_shape(monkeypatch):
    """Millisecond timestamps + usd units — the endpoint 422s on anything else.
    The window always starts at MONTHS_START (waterfall replay) and ends after
    the walked months."""
    cap = Capture([_el_analytics()])
    monkeypatch.setattr(_el, "http_json", cap)
    _el.meter(_EL_CREDS, ["2026-05", "2026-06"], TODAY)
    body = cap.calls[0]["data"]
    assert body["column_units"] == "usd"
    assert body["interval_seconds"] == 86400
    assert body["start_time"] == 1767225600000  # 2026-01-01T00:00:00Z in ms
    assert body["end_time"] == 1785542400000    # 2026-08-01T00:00:00Z in ms
    assert cap.calls[0]["headers"]["xi-api-key"] == "xi-admin-key"


def test_elevenlabs_meter_unexpected_columns_raise(monkeypatch):
    cap = Capture([{"columns": ["nope"], "rows": []}])
    monkeypatch.setattr(_el, "http_json", cap)
    with pytest.raises(RuntimeError, match="columns"):
        _el.meter(_EL_CREDS, ["2026-05"], TODAY)


def test_elevenlabs_meter_missing_key_raises():
    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        _el.meter({}, ["2026-05"], TODAY)


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
    """GCP cash rows keep native EUR in paid."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04", "2026-05"], TODAY, run_cmd=_gcp_run_success)
    cash_rows = [r for r in rows if r["paid"] > 0]
    assert len(cash_rows) >= 1
    apr = next((r for r in cash_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["paid"] == pytest.approx(1000.0, abs=0.01)
    assert apr["currency"] == "EUR"
    assert apr["source"] == "bq"


def test_gcp_meter_credit_rows():
    """GCP credit rows keep native abs(credits_amount) in credit."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=_gcp_run_success)
    credit_rows = [r for r in rows if r["credit"] > 0]
    assert len(credit_rows) >= 1
    apr = next((r for r in credit_rows if r["month"] == "2026-04"), None)
    assert apr is not None
    assert apr["credit"] == pytest.approx(50.0, abs=0.01)
    assert apr["currency"] == "EUR"


def test_gcp_meter_tempfile_deleted_on_success():
    """Key tempfile must be deleted after a SUCCESSFUL run (not just on failure)."""
    import tempfile as _tf
    import os

    import ingest.connectors.vendors.gcp as _gcp_mod

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

    import ingest.connectors.vendors.gcp as _gcp_mod
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


def test_gcp_meter_vendor_slug():
    """Vendor slug must be 'google'."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-04"], TODAY, run_cmd=_gcp_run_success)
    for r in rows:
        assert r["vendor"] == "google"


def test_gcp_meter_zero_credits_excluded():
    """Month with credits_amount=0.00 must NOT produce a credit row."""
    rows = _gcp.meter(_GCP_CREDS, ["2026-05"], TODAY, run_cmd=_gcp_run_success)
    credit_rows = [r for r in rows if r["credit"] > 0 and r["month"] == "2026-05"]
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
    assert apr["credit"] == pytest.approx(80.0, abs=0.01)


def test_openai_meter_credit(monkeypatch):
    """Meter rows put grant usage into credit."""
    page = _make_oai_page([(_APR15, 50.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    for r in rows:
        assert r["credit"] > 0
        assert r["paid"] == 0.0


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


def test_openai_meter_vendor_slug(monkeypatch):
    """Vendor slug must be 'openai'."""
    page = _make_oai_page([(_APR15, 10.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-04"], TODAY)
    for r in rows:
        assert r["vendor"] == "openai"


def test_openai_meter_waterfall_splits_at_grant_exhaustion(monkeypatch):
    """Usage crossing the $1,565.58 grant splits credit/cash in that month;
    earlier months count against the grant even when not requested."""
    page = _make_oai_page([(_APR15, 1500.0), (_JUN01, 100.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-06"], TODAY)
    by = {"credit" if r["credit"] else "paid": r for r in rows}
    assert by["credit"]["credit"] == pytest.approx(65.58, abs=0.01)
    assert by["paid"]["paid"] == pytest.approx(34.42, abs=0.01)


def test_openai_meter_cash_after_expiry_month(monkeypatch):
    """Past GRANT_LAST_MONTH (credits expire Aug 1) usage is cash even with
    grant capacity left."""
    aug03 = 1785715200  # 2026-08-03 UTC
    page = _make_oai_page([(_APR15, 10.0), (aug03, 25.0)])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    rows = _oai.meter(_OAI_CREDS, ["2026-08"], TODAY)
    assert len(rows) == 1
    assert rows[0]["paid"] == 25.0
    assert rows[0]["credit"] == 0.0


# ===========================================================================
# community.meter
# ===========================================================================


class _CommTB:
    """Minimal TB stub returning canned pollen_monthly aggregates."""

    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def sql(self, query):
        self.queries.append(query)
        return self.rows


def test_community_mirrors_pollen_as_credit():
    """Community usage is settled in pollen, never cash → credit rows."""
    tb = _CommTB([
        {"month": "2026-06", "cost": 0.29},
        {"month": "2026-07", "cost": 44.71},
    ])
    rows = _comm.meter({}, ["2026-06", "2026-07"], "2026-07-07", tb_client=tb)
    assert rows == [
        {"month": "2026-06", "vendor": "community", "currency": "USD",
         "category": "compute", "credit": 0.29, "paid": 0.0, "source": "api"},
        {"month": "2026-07", "vendor": "community", "currency": "USD",
         "category": "compute", "credit": 44.71, "paid": 0.0, "source": "api"},
    ]


def test_community_filters_months_and_zero_cost():
    tb = _CommTB([
        {"month": "2026-05", "cost": 12.0},   # outside requested window
        {"month": "2026-06", "cost": 0.0},    # zero month → no row
        {"month": "2026-07", "cost": 1.5},
    ])
    rows = _comm.meter({}, ["2026-06", "2026-07"], "2026-07-07", tb_client=tb)
    assert [r["month"] for r in rows] == ["2026-07"]


def test_community_queries_pollen_monthly_for_community_vendor():
    tb = _CommTB([])
    assert _comm.meter({}, ["2026-07"], "2026-07-07", tb_client=tb) == []
    assert len(tb.queries) == 1
    assert "pollen_monthly" in tb.queries[0]
    assert "vendor = 'community'" in tb.queries[0]


def test_community_missing_token_raises():
    with pytest.raises(RuntimeError, match="TINYBIRD_OPS_INGEST_TOKEN"):
        _comm.meter({}, ["2026-07"], "2026-07-07")


# ===========================================================================
# cloudflare.meter
# ===========================================================================

_CF_CREDS = {
    "CLOUDFLARE_POLLINATIONS_BILLING_TOKEN": "cfat_old",
    "CLOUDFLARE_MYCELI_API_TOKEN": "cf_myceli",
}


def _cf_history(*entries):
    return {"success": True, "result": [
        {"occurred_at": f"{month}-15T00:00:00Z", "type": kind, "amount": amount, "currency": "usd"}
        for month, kind, amount in entries
    ]}


def test_cloudflare_sums_invoices_across_both_accounts():
    responses = [
        _cf_history(("2026-01", "invoice", 2522.76), ("2026-02", "invoice", 1772.45)),
        _cf_history(("2026-02", "invoice", 100.0)),
    ]
    tokens_seen = []

    def fake_http(url, headers, timeout=60):
        tokens_seen.append(headers["Authorization"])
        return responses.pop(0)

    rows = _cf.meter(_CF_CREDS, ["2026-01", "2026-02"], "2026-07-07", http=fake_http)
    assert rows == [
        {"month": "2026-01", "vendor": "cloudflare", "currency": "USD",
         "category": "infra", "credit": 0.0, "paid": 2522.76, "source": "api"},
        {"month": "2026-02", "vendor": "cloudflare", "currency": "USD",
         "category": "infra", "credit": 0.0, "paid": 1872.45, "source": "api"},
    ]
    assert tokens_seen == ["Bearer cfat_old", "Bearer cf_myceli"]


def test_cloudflare_credits_offset_invoices_and_zero_months_skip():
    """A billing correction (credit) nets against the invoice — myceli June."""
    responses = [
        _cf_history(("2026-06", "invoice", 48.36)),
        _cf_history(("2026-06", "invoice", 1399.04), ("2026-06", "credit", 1399.04)),
    ]
    rows = _cf.meter(_CF_CREDS, ["2026-06"], "2026-07-07",
                     http=lambda *a, **k: responses.pop(0))
    assert rows == [
        {"month": "2026-06", "vendor": "cloudflare", "currency": "USD",
         "category": "infra", "credit": 0.0, "paid": 48.36, "source": "api"},
    ]


def test_cloudflare_skips_none_amounts_and_out_of_window_months():
    responses = [
        _cf_history(("2025-12", "invoice", 3782.31), ("2026-03", "invoice", None)),
        _cf_history(),
    ]
    rows = _cf.meter(_CF_CREDS, ["2026-03"], "2026-07-07",
                     http=lambda *a, **k: responses.pop(0))
    assert rows == []


def test_cloudflare_missing_tokens_raise():
    with pytest.raises(RuntimeError, match="CLOUDFLARE_MYCELI_API_TOKEN"):
        _cf.meter({"CLOUDFLARE_POLLINATIONS_BILLING_TOKEN": "x"}, ["2026-06"], "2026-07-07")


# ===========================================================================
# Registry: METER populated and slugs canonical
# ===========================================================================

def test_meter_registry_populated():
    """METER must contain 16 entries (the CE-based aws connector was retired
    2026-07 because Cost Explorer cannot see the Automat-it reseller's
    pricing; aws RETURNED 2026-07 via Umbrella Cost, the reseller's own
    meter, once AIT enabled tenant API access; azure added 2026-07:
    billing-profile invoice connector; openrouter + elevenlabs + runpod +
    anthropic + xai + alibaba added 2026-07; community added 2026-07:
    pollen-ledger mirror for user-deployed models)."""
    assert len(registry.METER) == 16


def test_meter_registry_slugs():
    """METER must contain all sixteen vendor slugs."""
    slugs = {slug for slug, _ in registry.METER}
    for expected in ("alibaba", "anthropic", "aws", "azure", "cloudflare", "community", "deepinfra", "elevenlabs", "vast.ai", "ovhcloud", "fireworks", "google", "openai", "openrouter", "runpod", "xai"):
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


# ===========================================================================
# aws.meter (Umbrella Cost / Automat-it)
# ===========================================================================

_AWS_CREDS = {"UMBRELLA_USERNAME": "elliot@test", "UMBRELLA_PASSWORD": "pw"}


def _aws_responses(cue_by_call):
    """Auth + users + the CUE responses in call order.

    Call order: token/generate, /users, then per account (30366, 30365)
    per cost type (cost, discount).
    """
    return [
        {"Authorization": "raw-token", "apikey": "user-key-uuid:-1"},
        {"accounts": [{"accountKey": 30366}, {"accountKey": 30365}]},
        *cue_by_call,
    ]


def _cue(rows, next_token=None):
    d = {"data": rows}
    if next_token:
        d["nextToken"] = next_token
    return d


def test_aws_meter_sums_accounts_and_cost_types(monkeypatch):
    """Months sum across both accounts, discounts (negative) net in, and
    funding flips at GRANT_FROM: April cash, May+ credit. Bedrock service
    lines land in compute; everything else (incl. discounts) in infra."""
    cap = Capture(_aws_responses([
        _cue([{"usage_date": "2026-04", "service_name": "Amazon Bedrock", "total_cost": 4000.00},
              {"usage_date": "2026-04", "service_name": "Amazon Elastic Compute Cloud", "total_cost": 777.60},
              {"usage_date": "2026-05", "service_name": "Claude Opus 4.8 [Amazon Bedrock Edition]", "total_cost": 5797.53},
              {"usage_date": "2026-06", "service_name": "Amazon Bedrock", "total_cost": 4798.54}]),  # 30366 cost
        _cue([{"usage_date": "2026-04", "service_name": "Adjustment", "total_cost": -15.00}]),        # 30366 discount
        _cue([{"usage_date": "2026-05", "service_name": "Amazon Virtual Private Cloud", "total_cost": 769.60},
              {"usage_date": "2026-06", "service_name": "AWS CloudTrail", "total_cost": 801.18}]),    # 30365 cost
        _cue([{"usage_date": "2026-06", "service_name": "Credits Usage", "total_cost": -858.28}]),    # 30365 discount
    ]))
    monkeypatch.setattr(_aws, "http_json", cap)
    rows = _aws.meter(_AWS_CREDS, ["2026-04", "2026-05", "2026-06"], TODAY)
    by_key = {(r["month"], r["category"]): r for r in rows}
    assert by_key[("2026-04", "compute")]["paid"] == pytest.approx(4000.00)
    assert by_key[("2026-04", "infra")]["paid"] == pytest.approx(762.60)
    assert by_key[("2026-04", "compute")]["credit"] == 0.0
    assert by_key[("2026-05", "compute")]["credit"] == pytest.approx(5797.53)
    assert by_key[("2026-05", "infra")]["credit"] == pytest.approx(769.60)
    assert by_key[("2026-06", "compute")]["credit"] == pytest.approx(4798.54)
    assert by_key[("2026-06", "infra")]["credit"] == pytest.approx(-57.10)
    for r in rows:
        assert r["vendor"] == "aws"
        assert r["source"] == "api"
        assert r["currency"] == "USD"


def test_aws_meter_auth_chain_and_url_params(monkeypatch):
    """token/generate posts the creds; /users gets the raw apikey; CUE calls
    carry userkey:accountKey: and the UM 2.0 query contract."""
    cap = Capture(_aws_responses([_cue([]), _cue([]), _cue([]), _cue([])]))
    monkeypatch.setattr(_aws, "http_json", cap)
    _aws.meter(_AWS_CREDS, ["2026-06"], TODAY)
    assert len(cap.calls) == 6
    auth_call = cap.calls[0]
    assert auth_call["data"] == {"username": "elliot@test", "password": "pw"}
    users_call = cap.calls[1]
    assert users_call["headers"]["apikey"] == "user-key-uuid:-1"
    assert users_call["headers"]["authorization"] == "raw-token"
    first_cue = cap.calls[2]
    assert first_cue["headers"]["apikey"] == "user-key-uuid:30366:"
    assert "groupBy=service" in first_cue["url"]
    assert "periodGranLevel=month" in first_cue["url"]
    assert "isNetUnblended=true" in first_cue["url"]
    assert "costType=cost" in first_cue["url"]
    assert "startDate=2026-04-01" in first_cue["url"]
    assert f"endDate={TODAY}" in first_cue["url"]
    assert "costType=discount" in cap.calls[3]["url"]
    assert cap.calls[4]["headers"]["apikey"] == "user-key-uuid:30365:"


def test_aws_meter_paginates_next_token(monkeypatch):
    """CUE pages chained via nextToken are all consumed."""
    cap = Capture([
        {"Authorization": "raw-token", "apikey": "user-key-uuid:-1"},
        {"accounts": [{"accountKey": 30366}]},
        _cue([{"usage_date": "2026-06", "service_name": "Amazon Bedrock", "total_cost": 100.0}], next_token="t2"),
        _cue([{"usage_date": "2026-06", "service_name": "Amazon Bedrock", "total_cost": 23.0}]),
        _cue([]),
    ])
    monkeypatch.setattr(_aws, "http_json", cap)
    rows = _aws.meter(_AWS_CREDS, ["2026-06"], TODAY)
    assert rows[0]["credit"] == pytest.approx(123.0)
    assert rows[0]["category"] == "compute"
    assert "token=t2" in cap.calls[3]["url"]


def test_aws_meter_zero_months_emit_nothing(monkeypatch):
    """Months without Umbrella data (pre-onboarding) emit no rows."""
    cap = Capture(_aws_responses([
        _cue([{"usage_date": "2026-06", "service_name": "Amazon Bedrock", "total_cost": 10.0}]),
        _cue([]), _cue([]), _cue([]),
    ]))
    monkeypatch.setattr(_aws, "http_json", cap)
    assert _aws.meter(_AWS_CREDS, ["2026-01", "2026-02"], TODAY) == []


def test_aws_meter_missing_creds_raise():
    with pytest.raises(RuntimeError, match="UMBRELLA"):
        _aws.meter({}, ["2026-06"], TODAY)


def test_aws_meter_no_accounts_raises(monkeypatch):
    cap = Capture([
        {"Authorization": "raw-token", "apikey": "user-key-uuid:-1"},
        {"accounts": []},
    ])
    monkeypatch.setattr(_aws, "http_json", cap)
    with pytest.raises(RuntimeError, match="no accounts"):
        _aws.meter(_AWS_CREDS, ["2026-06"], TODAY)
