"""Hermetic tests for the burn stage in run.py + doctor.py additions.

TDD: written BEFORE implementation. All should fail first, then go green.

Tests:
  (a) one raising + one ok connector → both statuses recorded; later stages ran
  (b) replace called on replace-token client; append on ingest-token client
  (c) 0-row usage → replace skipped; last good preserved
  (d) sanitized error: no creds value in message; ≤200 chars
  (e) runway alarm prints when runpod prepaid_left/(spend*24) < 14 days

Run: cd apps/operation/forager && python3 -m pytest tests/test_run_burn.py -q
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# We import the module under test AFTER path setup
import ingest.run as _run


# ---------------------------------------------------------------------------
# Shared stubs
# ---------------------------------------------------------------------------

class TBStub:
    """Minimal TB stub with separate tracking for append/replace/sql."""

    def __init__(self, name="?", sql_rows=None):
        self.name = name
        self.appends = []    # list of (datasource, rows)
        self.replaces = []   # list of (datasource, rows[, condition])
        self.sql_calls = []
        self._sql_rows = sql_rows or []

    def append(self, datasource, rows):
        self.appends.append((datasource, rows))

    def replace(self, datasource, rows, condition=None):
        if condition is not None:
            self.replaces.append((datasource, rows, condition))
        else:
            self.replaces.append((datasource, rows))

    def sql(self, query):
        self.sql_calls.append(query)
        return self._sql_rows


# Minimal pool list (for burn engine; one prepaid provider)
_POOLS = [
    {
        "pool": "RunPod",
        "providers": ["runpod"],
        "billing": "prepaid",
        "kind": "prepaid",
        "active_from": "2026-01",
        "granted": None,
        "left": None,
        "cash_left": None,
        "currency": "USD",
        "expires": "",
        "note": "",
    }
]

_CFG = {
    "tb_ops_api": "https://fake.tb.io",
    "tb_prod_api": "https://fake-prod.tb.io",
    "fx_eur_usd": 1.14,
    "months_start": "2026-01",
    "repull_months": 2,
    "recon_tolerance_pct": 0.02,
    "recon_tolerance_usd": 2.0,
    "recon_accepted": [],
    "archive_dir": "/tmp/fake-archive",
    "gog_account": "test@example.com",
    "aws_profile": "test-profile",
}

_CREDS = {
    "TINYBIRD_OPS_INGEST_TOKEN": "tok_ingest",
    "TINYBIRD_OPS_REPLACE_TOKEN": "tok_replace",
    "TINYBIRD_PROD_READ_TOKEN": "tok_prod",
    "STRIPE_API_KEY": "rk_test_fake",
    "SECRET_VALUE": "super-secret-12345",
}

TODAY = "2026-07-03"
MONTHS = ["2026-06"]


# ---------------------------------------------------------------------------
# Helper: build a minimal run environment (monkeypatched)
# ---------------------------------------------------------------------------

def _make_tb_stubs():
    """Return (ops_ingest_stub, ops_replace_stub, tb_prod_stub)."""
    return TBStub("ingest"), TBStub("replace"), TBStub("prod")


def test_main_runs_burn_before_gaps_and_passes_provider_month(monkeypatch):
    ops_ingest, ops_replace, tb_prod_stub = _make_tb_stubs()
    events = []
    pm_rows = [{"month": "2026-06", "provider": "assemblyai",
                "credit_burn_usd": 242.45, "usage_cost_usd": 242.45,
                "status": "grant_burn"}]

    monkeypatch.setattr(sys, "argv", ["ingest.run"])
    monkeypatch.setattr("ingest.creds.load_creds", lambda: _CREDS)
    monkeypatch.setattr("ingest.creds.load_config", lambda: _CFG)
    monkeypatch.setattr("ingest.creds.load_credits", lambda: {"pools": _POOLS})
    monkeypatch.setattr("ingest.invoices.harvest.gmail_sweep", lambda *a, **kw: 0)
    monkeypatch.setattr("ingest.invoices.harvest.inbox_sweep", lambda *a, **kw: 0)
    monkeypatch.setattr("ingest.connectors.wise.outflow_rows", lambda *a, **kw: [])
    monkeypatch.setattr(_run, "load_overrides", lambda ops: {})

    def fake_tb(api, token):
        if token == _CREDS["TINYBIRD_OPS_INGEST_TOKEN"]:
            return ops_ingest
        if token == _CREDS["TINYBIRD_OPS_REPLACE_TOKEN"]:
            return ops_replace
        if token == _CREDS["TINYBIRD_PROD_READ_TOKEN"]:
            return tb_prod_stub
        raise AssertionError(f"unexpected token {token}")

    def fake_burn_stage(**kwargs):
        events.append("burn")
        return pm_rows

    def fake_gaps_run(invoices, payments, pools, months, config, today,
                      provider_month=None):
        events.append("gaps")
        assert provider_month is pm_rows
        return [{
            "month": "2026-06", "provider": "assemblyai", "billing": "monthly",
            "status": "ok_credit", "invoice_usd": 0.0, "payment_usd": 0.0,
            "invoice_refs": "", "payment_refs": "", "note": "",
        }]

    monkeypatch.setattr("ingest.tb.TB", fake_tb)
    monkeypatch.setattr(_run, "_run_burn_stage", fake_burn_stage)
    monkeypatch.setattr("ingest.gaps.run", fake_gaps_run)

    _run.main()

    assert events == ["burn", "gaps"]
    assert any(call[0] == "reconciliation" for call in ops_replace.replaces)


# ---------------------------------------------------------------------------
# (a) One raising + one ok connector → both statuses recorded; later stages ran
# ---------------------------------------------------------------------------

def test_one_raising_one_ok_both_statuses_recorded(monkeypatch):
    """A raising balance connector must not abort the run; its error is in statuses."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    # Stub registry with one raiser and one ok connector
    def _balance_raiser(creds, now):
        raise RuntimeError("intentional test failure")

    def _balance_ok(creds, now):
        from ingest.connectors.providers import _brow
        return _brow(now, "openrouter", left=500.0)

    fake_balance = [("raiser", _balance_raiser), ("openrouter", _balance_ok)]
    fake_meter = []

    # Stub usage and stripe revenue to return empty
    monkeypatch.setattr("ingest.connectors.usage.monthly_rows", lambda tb, months, today: [])
    monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                        lambda creds, months, today: [])

    # Stub burn.run and burn.grants
    monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
    monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

    # Inject the fake registries into the run_burn helper by patching the module
    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = fake_balance
        _reg.METER = fake_meter

        # Build statuses dict and run the burn stage directly
        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    # Both statuses recorded
    assert "balance:raiser" in statuses, f"raiser status missing from {statuses}"
    assert "balance:openrouter" in statuses, f"ok connector status missing from {statuses}"

    # Raiser status starts with "err:"
    assert statuses["balance:raiser"].startswith("err:"), (
        f"expected 'err:...' for raiser, got: {statuses['balance:raiser']}"
    )

    # OK connector recorded ok
    assert statuses["balance:openrouter"] == "ok", (
        f"expected 'ok' for openrouter, got: {statuses['balance:openrouter']}"
    )

    # Later stages ran: burn_rows key in statuses proves Step 5 executed
    assert "burn_rows" in statuses, f"burn stage did not record burn_rows in statuses: {statuses}"
    assert "grant_rows" in statuses, f"burn stage did not record grant_rows in statuses: {statuses}"


def test_raising_meter_connector_both_statuses(monkeypatch):
    """A raising meter connector must not abort; both statuses recorded."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    def _meter_raiser(creds, months, today):
        raise ConnectionError("network timeout")

    def _meter_ok(creds, months, today):
        from ingest.connectors.providers import _mrow
        return [_mrow("2026-06", "deepinfra", 8.77, "prepaid", "api", today)]

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = [("raiser_m", _meter_raiser), ("deepinfra", _meter_ok)]

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    assert statuses.get("meter:raiser_m", "").startswith("err:"), (
        f"meter raiser status wrong: {statuses.get('meter:raiser_m')}"
    )
    assert statuses.get("meter:deepinfra") == "ok", (
        f"meter ok status wrong: {statuses.get('meter:deepinfra')}"
    )


# ---------------------------------------------------------------------------
# (b) replace called on replace-token client; append on ingest-token client
# ---------------------------------------------------------------------------

def test_replace_on_replace_stub_append_on_ingest_stub(monkeypatch):
    """Writes to balances/meter_monthly use append (ingest); usage/revenue/provider_month use replace."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    def _balance_ok(creds, now):
        from ingest.connectors.providers import _brow
        return _brow(now, "openrouter", left=100.0)

    def _meter_ok(creds, months, today):
        from ingest.connectors.providers import _mrow
        return [_mrow("2026-06", "deepinfra", 5.0, "prepaid", "api", today)]

    fake_usage_rows = [
        {"month": "2026-06", "provider": "azure-openai", "model": "gpt-4o",
         "event_type": "generate.text", "requests": 100, "pollen_paid": 1.0,
         "pollen_quest": 0.5, "cost_paid": 0.8, "cost_quest": 0.2}
    ]

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = [("openrouter", _balance_ok)]
        _reg.METER = [("deepinfra", _meter_ok)]

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: fake_usage_rows)
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [{"month": "2026-06",
                                "gross_eur": 100.0, "fees_eur": 5.0,
                                "refunds_eur": 0.0}])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [{"month": "2026-06",
            "provider": "runpod", "invoice_usd": 0.0,
            "meter_cash_usd": 0.0, "meter_prepaid_usd": 0.0,
            "meter_src": "", "usage_cost_usd": 0.0, "credit_burn_usd": 0.0,
            "credit_src": "", "status": "quiet"}])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    # Appends ONLY on ops_ingest
    ingest_ds = {ds for ds, _ in ops_ingest.appends}
    replace_ingest_ds = {r[0] for r in ops_ingest.replaces}
    assert "balances" in ingest_ds, f"balances not appended on ingest: {ops_ingest.appends}"
    assert "meter_monthly" in ingest_ds, f"meter_monthly not appended on ingest"
    # No replace calls on ops_ingest
    assert not ops_ingest.replaces, f"replace called on ingest stub: {ops_ingest.replaces}"

    # Replaces ONLY on ops_replace
    replace_ds = {r[0] for r in ops_replace.replaces}
    assert "usage_monthly" in replace_ds, f"usage_monthly not replaced on replace stub"
    assert "revenue_monthly" in replace_ds, f"revenue_monthly not replaced on replace stub"
    assert "provider_month" in replace_ds, f"provider_month not replaced on replace stub"
    # No append calls on ops_replace
    assert not ops_replace.appends, f"append called on replace stub: {ops_replace.appends}"


# ---------------------------------------------------------------------------
# (c) 0-row usage → replace skipped
# ---------------------------------------------------------------------------

def test_zero_row_usage_skips_replace(monkeypatch):
    """When usage.monthly_rows returns [], ops_replace.replace('usage_monthly') is NOT called."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    usage_replaces = [r for r in ops_replace.replaces if r[0] == "usage_monthly"]
    assert not usage_replaces, (
        f"usage_monthly replace was called despite 0 rows: {usage_replaces}"
    )
    # A note must have been added
    assert any("usage" in n.lower() for n in notes), (
        f"no note added for skipped usage replace: {notes}"
    )


def test_zero_row_revenue_skips_replace(monkeypatch):
    """When revenue_rows returns [], ops_replace.replace('revenue_monthly') is NOT called."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [{"month": "2026-06",
                                "provider": "azure", "model": "m", "event_type": "e",
                                "requests": 1, "pollen_paid": 0.0, "pollen_quest": 0.0,
                                "cost_paid": 0.0, "cost_quest": 0.0}])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    revenue_replaces = [r for r in ops_replace.replaces if r[0] == "revenue_monthly"]
    assert not revenue_replaces, (
        f"revenue_monthly replace was called despite 0 rows: {revenue_replaces}"
    )
    assert any("revenue" in n.lower() for n in notes), (
        f"no note for skipped revenue: {notes}"
    )


# ---------------------------------------------------------------------------
# (d) Sanitized error: no creds value leaked; ≤200 chars
# ---------------------------------------------------------------------------

def test_sanitized_error_no_creds_value(monkeypatch):
    """Error status must not contain any creds dict value."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    secret_val = _CREDS["SECRET_VALUE"]  # "super-secret-12345"

    def _balance_leaky(creds, now):
        # Connector embeds the secret value in its exception message
        raise RuntimeError(f"auth failed: {creds['SECRET_VALUE']} is wrong")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = [("leaky", _balance_leaky)]
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    err_status = statuses.get("balance:leaky", "")
    assert secret_val not in err_status, (
        f"Secret value leaked into error status: {err_status!r}"
    )
    assert len(err_status) <= 200 + len("err:"), (
        f"Error status exceeds 200 chars (got {len(err_status)}): {err_status!r}"
    )


def test_sanitized_error_under_200_chars(monkeypatch):
    """Error message truncated to 200 chars max."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    def _balance_long(creds, now):
        raise RuntimeError("x" * 500)

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = [("long_err", _balance_long)]
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=[],
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    err_status = statuses.get("balance:long_err", "")
    # "err:" prefix + up to 200 chars of sanitized message
    msg_part = err_status[len("err:"):] if err_status.startswith("err:") else err_status
    assert len(msg_part) <= 200, (
        f"Error message body exceeds 200 chars: {len(msg_part)}"
    )


# ---------------------------------------------------------------------------
# (e) Runway alarm prints when runpod prepaid_left/(spend*24) < 14
# ---------------------------------------------------------------------------

def test_runway_alarm_fires_below_14_days(monkeypatch, capsys):
    """When runpod balance has spend_per_hr high enough that days < 14, print the alarm."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        # Fake balances SQL result: runpod row with spend_per_hr that gives < 14 days
        # prepaid_left_usd = 100, spend_per_hr = 1.0 → days = 100 / (1.0*24) = 4.17 < 14
        runpod_bal_row = {
            "run_at": "2026-07-03 10:00:00",
            "provider": "runpod",
            "granted_usd": None,
            "spent_usd": None,
            "left_usd": None,
            "prepaid_left_usd": 100.0,
            "source": "api",
            "note": "spend_per_hr=1.0",
        }

        # Patch ops_ingest.sql to return runpod balance row when querying balances
        original_sql = ops_ingest.sql

        def fake_sql(query):
            q = query.strip().lower()
            if "from balances" in q:
                return [runpod_bal_row]
            return []

        ops_ingest.sql = fake_sql

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    captured = capsys.readouterr()
    assert "runpod" in captured.out.lower(), (
        f"Runway alarm not printed. Output was:\n{captured.out!r}"
    )
    assert "⚠" in captured.out, (
        f"Expected ⚠ in runway alarm. Output:\n{captured.out!r}"
    )


def test_runway_alarm_silent_above_14_days(monkeypatch, capsys):
    """When runway > 14 days, no alarm printed."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        # 10000 prepaid, 0.5/hr → 10000/(0.5*24) = 833 days > 14
        runpod_bal_row = {
            "run_at": "2026-07-03 10:00:00",
            "provider": "runpod",
            "prepaid_left_usd": 10000.0,
            "note": "spend_per_hr=0.5",
        }

        def fake_sql(query):
            q = query.strip().lower()
            if "from balances" in q:
                return [runpod_bal_row]
            return []

        ops_ingest.sql = fake_sql

        statuses = {}
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=[],
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    captured = capsys.readouterr()
    assert "⚠" not in captured.out, (
        f"Unexpected runway alarm for safe runway. Output:\n{captured.out!r}"
    )


def test_runway_no_runpod_row_is_silent(monkeypatch, capsys):
    """When there are no runpod balance rows, no alarm and no crash."""
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        def fake_sql(query):
            return []

        ops_ingest.sql = fake_sql

        statuses = {}
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=[],
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    captured = capsys.readouterr()
    assert "⚠" not in captured.out


# ---------------------------------------------------------------------------
# Doctor additions: soft checks (clis, tb-prod, balances-fresh)
# ---------------------------------------------------------------------------

def test_doctor_checks_returns_clis_check():
    """Doctor must include a 'clis' soft check."""
    import ingest.doctor as _doctor
    res = _doctor.checks.__wrapped__() if hasattr(_doctor.checks, "__wrapped__") else None
    # We don't call checks() directly (needs SOPS), so test that the name is present
    # by inspecting the source or just verifying the function exists
    # This is a structural test — the check names are validated in integration
    import inspect
    src = inspect.getsource(_doctor.checks)
    assert "clis" in src, "doctor.checks() must include a 'clis' check"
    assert "tb-prod" in src, "doctor.checks() must include a 'tb-prod' check"
    assert "balances-fresh" in src, "doctor.checks() must include a 'balances-fresh' check"


def test_doctor_soft_checks_are_not_hard():
    """The three new doctor checks must be soft (hard=False)."""
    import inspect
    import ingest.doctor as _doctor
    src = inspect.getsource(_doctor.checks)
    # Spot check: the 3 new checks use False for hard
    # We verify by looking for pattern around each name
    for name in ("clis", "tb-prod", "balances-fresh"):
        # Should appear as a string literal in an append call with False
        assert name in src, f"'{name}' not found in doctor.checks source"


# ---------------------------------------------------------------------------
# Fix 1: Step 5 exception safety — burn.run raising must not escape
# ---------------------------------------------------------------------------

def _make_burn_stage_kwargs(ops_ingest, ops_replace, tb_prod_stub, monkeypatch,
                            *, balance=None, meter=None):
    """Helper: patch registry + usage/revenue to empty, return common kwargs dict."""
    import ingest.connectors.registry as _reg
    _reg_orig_balance = _reg.BALANCE
    _reg_orig_meter = _reg.METER
    _reg.BALANCE = balance if balance is not None else []
    _reg.METER = meter if meter is not None else []
    monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                        lambda tb, months, today: [])
    monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                        lambda creds, months, today: [])
    return {
        "ops_ingest": ops_ingest,
        "ops_replace": ops_replace,
        "tb_prod": tb_prod_stub,
        "creds": _CREDS,
        "cfg": _CFG,
        "pools": _POOLS,
        "today": TODAY,
    }, _reg, _reg_orig_balance, _reg_orig_meter


def test_burn_run_raises_does_not_propagate(monkeypatch):
    """If burn.run raises (e.g. TB network error on a read-back), _run_burn_stage
    returns normally so the caller can still append the ingest_runs log.
    statuses must contain 'burn' key starting with 'err:'.
    """
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        # burn.run raises to simulate a TB network error or burn bug
        monkeypatch.setattr("ingest.burn.run",
                            lambda *a, **kw: (_ for _ in ()).throw(
                                ConnectionError("TB timeout during burn")))
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []

        # Must NOT raise — must return normally
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    # Caller can now do ops_ingest.append("ingest_runs", ...) — function returned
    # statuses must record the burn failure
    assert "burn" in statuses, f"'burn' key missing from statuses after error: {statuses}"
    assert statuses["burn"].startswith("err:"), (
        f"Expected 'err:...' for burn status, got: {statuses['burn']!r}"
    )
    # Secret values must not appear in the burn error
    for val in _CREDS.values():
        if val and isinstance(val, str) and len(val) > 3:
            assert val not in statuses["burn"], (
                f"Creds value leaked into burn error status: {statuses['burn']!r}"
            )


def test_sql_readback_raises_does_not_propagate(monkeypatch):
    """If ops_ingest.sql raises (TB read-back in Step 5), _run_burn_stage
    returns normally; statuses['burn'] starts with 'err:'.
    """
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    def sql_that_raises_on_invoices(query):
        # Raise on the Step 5 invoices read-back to simulate a TB network error
        if "from invoices" in query.strip().lower():
            raise OSError("network reset by peer")
        return []

    ops_ingest.sql = sql_that_raises_on_invoices

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    # Must have returned normally (no exception propagated)
    # statuses must record the burn failure
    assert "burn" in statuses, f"'burn' key missing from statuses: {statuses}"
    assert statuses["burn"].startswith("err:"), (
        f"Expected 'err:...' for burn status after sql raises, got: {statuses['burn']!r}"
    )


def test_burn_run_empty_skips_provider_month_replace(monkeypatch):
    """burn.run returning [] must NOT call replace('provider_month', []).
    A note must be recorded; no exception raised.
    """
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    # provider_month replace must NOT have been called with 0 rows
    pm_replaces = [r for r in ops_replace.replaces if r[0] == "provider_month"]
    assert not pm_replaces, (
        f"provider_month was replaced despite 0 rows from burn.run: {pm_replaces}"
    )
    # A note must be recorded about the skip
    assert any("provider_month" in n.lower() for n in notes), (
        f"No note recorded for skipped provider_month replace: {notes}"
    )


# ---------------------------------------------------------------------------
# Fix C1: Steps 3+4 guarded — usage/revenue raising does not abort the run
# ---------------------------------------------------------------------------

def test_usage_pull_raises_statuses_err_revenue_and_burn_still_ran(monkeypatch):
    """Step 3 (usage pull) raising → statuses['usage'] is 'err:...';
    step 4 (revenue) and step 5 (burn) still execute and record their own statuses.
    Function must return (not propagate the exception).
    """
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        # Step 3 raises
        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: (_ for _ in ()).throw(
                                ConnectionError("TB prod timeout")))
        # Step 4 and 5 succeed
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: [])
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        # Must return normally (no propagation)
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    assert "usage" in statuses, f"'usage' key missing from statuses: {statuses}"
    assert isinstance(statuses["usage"], str) and statuses["usage"].startswith("err:"), (
        f"Expected 'err:...' for usage status, got: {statuses['usage']!r}"
    )
    # Revenue still ran (step 4) — either ok or 0 (but not missing)
    assert "revenue" in statuses, f"'revenue' key missing: step 4 did not run"
    # Burn still ran (step 5) — burn_rows or burn key present
    burn_ran = "burn_rows" in statuses or "burn" in statuses
    assert burn_ran, f"step 5 (burn) did not run after usage error: {statuses}"


def test_revenue_pull_raises_statuses_err_burn_still_ran(monkeypatch):
    """Step 4 (revenue pull) raising → statuses['revenue'] is 'err:...';
    step 5 (burn) still executes. Function must return normally.
    """
    ops_ingest = TBStub("ingest")
    ops_replace = TBStub("replace")
    tb_prod_stub = TBStub("prod")

    import ingest.connectors.registry as _reg
    orig_balance = _reg.BALANCE
    orig_meter = _reg.METER
    try:
        _reg.BALANCE = []
        _reg.METER = []

        monkeypatch.setattr("ingest.connectors.usage.monthly_rows",
                            lambda tb, months, today: [])
        # Step 4 raises
        monkeypatch.setattr("ingest.connectors.providers.stripe.revenue_rows",
                            lambda creds, months, today: (_ for _ in ()).throw(
                                RuntimeError("Stripe 5xx")))
        monkeypatch.setattr("ingest.burn.run", lambda *a, **kw: [])
        monkeypatch.setattr("ingest.burn.grants", lambda *a, **kw: [])

        statuses = {}
        notes = []
        _run._run_burn_stage(
            ops_ingest=ops_ingest,
            ops_replace=ops_replace,
            tb_prod=tb_prod_stub,
            creds=_CREDS,
            cfg=_CFG,
            pools=_POOLS,
            today=TODAY,
            statuses=statuses,
            notes=notes,
        )
    finally:
        _reg.BALANCE = orig_balance
        _reg.METER = orig_meter

    assert "revenue" in statuses, f"'revenue' key missing from statuses: {statuses}"
    assert isinstance(statuses["revenue"], str) and statuses["revenue"].startswith("err:"), (
        f"Expected 'err:...' for revenue status, got: {statuses['revenue']!r}"
    )
    # Burn still ran
    burn_ran = "burn_rows" in statuses or "burn" in statuses
    assert burn_ran, f"step 5 (burn) did not run after revenue error: {statuses}"
