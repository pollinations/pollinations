"""Hermetic tests for signed/CLI/derived balance connectors (B4).

Connectors: ovh, vast, fireworks, openai_, azure.
All hermetic — http_json monkeypatched on each module; run_cmd injected for CLI
connectors. No network, no SOPS, no real credentials.

Run: cd apps/operation/forager && python3 -m pytest tests/test_providers_cli.py -q
"""
import hashlib
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import ingest.connectors.providers.ovh as _ovh
import ingest.connectors.providers.vast as _vast
import ingest.connectors.providers.fireworks as _fw
import ingest.connectors.providers.openai_ as _oai
import ingest.connectors.providers.azure as _az
from ingest.connectors import registry

NOW = "2026-07-03 14:05:00"


# ---------------------------------------------------------------------------
# Capture helper — records calls, returns canned JSON responses in order
# ---------------------------------------------------------------------------

class Capture:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def __call__(self, url, headers=None, timeout=30, data=None, method=None):
        self.calls.append({"url": url, "headers": headers or {}, "data": data, "method": method})
        return self._responses.pop(0)


# ---------------------------------------------------------------------------
# Fake subprocess.run result
# ---------------------------------------------------------------------------

def _fake_result(stdout="", stderr="", returncode=0):
    r = types.SimpleNamespace()
    r.stdout = stdout
    r.stderr = stderr
    r.returncode = returncode
    return r


# ===========================================================================
# OVH
# ===========================================================================

_OVH_CREDS = {
    "OVH_APPLICATION_KEY": "test_app_key",
    "OVH_APPLICATION_SECRET": "test_secret",
    "OVH_CONSUMER_KEY": "test_consumer",
}

# Fixed inputs for deterministic signature test
_OVH_TS = 1735000000
_OVH_METHOD = "GET"
_OVH_URL = "https://eu.api.ovh.com/1.0/me/credit/balance/STARTUP_PROGRAM"
_OVH_BODY = ""


def _expected_sig():
    s = f"test_secret+test_consumer+{_OVH_METHOD}+{_OVH_URL}+{_OVH_BODY}+{_OVH_TS}"
    return "$1$" + hashlib.sha1(s.encode()).hexdigest()


def test_ovh_signature_fixed_inputs():
    """_signed must produce the exact sha1 hex for known fixed inputs."""
    sig = _ovh._signed(_OVH_CREDS, _OVH_METHOD, "/me/credit/balance/STARTUP_PROGRAM", _OVH_BODY, _OVH_TS)
    expected = _expected_sig()
    assert sig == expected
    # Verify the literal sha1 hex we hardcoded above
    assert sig == "$1$c5eaee4d327b6164e953e4c36f167807b0007ecd"


def test_ovh_balance_row(monkeypatch):
    """Balance row EUR amounts multiplied by fx → USD fields."""
    balance_resp = {
        "amount": {"value": "500.00"},
        "expiring": [{"expirationDate": "2027-12-31T00:00:00+00:00"}],
    }
    # First call: /auth/time → returns timestamp integer (as JSON number)
    # Second call: /me/credit/balance/STARTUP_PROGRAM
    # Third call: /me/credit/balance/STARTUP_PROGRAM/movement → list of IDs
    # Fourth call: movement detail (type VOUCHER)
    # Fifth call: movement detail (type USE)
    movement_ids_resp = [1001, 1002]
    movement_voucher = {
        "type": "VOUCHER",
        "amount": {"value": "600.00"},
        "creationDate": "2026-01-10T10:00:00+00:00",
    }
    movement_use = {
        "type": "USE",
        "amount": {"value": "-100.00"},
        "creationDate": "2026-06-15T10:00:00+00:00",
    }

    # Monkeypatch _time to return fixed timestamp
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)

    cap = Capture([balance_resp, movement_ids_resp, movement_voucher, movement_use])
    monkeypatch.setattr(_ovh, "http_json", cap)

    fx = 1.14
    row = _ovh.balance(_OVH_CREDS, NOW, fx=fx)

    assert row["provider"] == "ovhcloud"
    assert row["source"] == "api"
    assert row["run_at"] == NOW
    # granted = voucher sum 600.0 × fx; left = balance 500.0 × fx
    assert row["granted_usd"] == pytest.approx(600.0 * fx, abs=0.01)
    assert row["left_usd"] == pytest.approx(500.0 * fx, abs=0.01)
    assert "2027-12-31" in row["note"]


def test_ovh_signed_headers(monkeypatch):
    """balance() must send all four X-Ovh-* headers on every request."""
    monkeypatch.setattr(_ovh, "_time", lambda: _OVH_TS)
    cap = Capture([
        {"amount": {"value": "100.00"}, "expiring": []},
        [],
    ])
    monkeypatch.setattr(_ovh, "http_json", cap)
    _ovh.balance(_OVH_CREDS, NOW)
    for call in cap.calls:
        h = call["headers"]
        assert "X-Ovh-Application" in h
        assert "X-Ovh-Consumer" in h
        assert "X-Ovh-Timestamp" in h
        assert "X-Ovh-Signature" in h


def test_ovh_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _ovh.balance({}, NOW)


def test_ovh_time_routes_through_http_json(monkeypatch):
    """_time() must use http_json (not urllib.request.urlopen) so UA header is sent."""
    calls = []

    def fake_http_json(url, headers=None, timeout=30, **kw):
        calls.append(url)
        return 1234

    monkeypatch.setattr(_ovh, "http_json", fake_http_json)
    result = _ovh._time()
    assert result == 1234
    assert len(calls) == 1
    assert "/auth/time" in calls[0]


# ===========================================================================
# Vast
# ===========================================================================

_VAST_CREDS = {"VAST_API_KEY": "vast-key"}


def test_vast_balance_row():
    """vastai show user → .credit goes to prepaid_left_usd."""
    stdout = '{"credit": 123.45, "username": "pollin"}'
    fake_run = lambda cmd, **kw: _fake_result(stdout=stdout)
    row = _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)
    assert row["provider"] == "vast.ai"
    assert row["prepaid_left_usd"] == 123.45
    assert row["granted_usd"] is None
    assert row["spent_usd"] is None
    assert row["left_usd"] is None
    assert row["source"] == "cli"
    assert row["run_at"] == NOW


def test_vast_cli_command():
    """Must call vastai show user --raw."""
    cmds = []
    fake_run = lambda cmd, **kw: (cmds.append(cmd), _fake_result(stdout='{"credit": 1.0}'))[1]
    _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)
    assert cmds[0] == ["vastai", "show", "user", "--raw"]


def test_vast_missing_credit_raises():
    fake_run = lambda cmd, **kw: _fake_result(stdout='{"username": "x"}')
    with pytest.raises(RuntimeError):
        _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)


def test_vast_bad_json_raises():
    fake_run = lambda cmd, **kw: _fake_result(stdout="not-json", stderr="err")
    with pytest.raises(RuntimeError):
        _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)


def test_vast_nonzero_returncode_raises_without_content(monkeypatch):
    """rc != 0 must raise RuntimeError; message must NOT contain stdout/stderr content."""
    fake_run = lambda cmd, **kw: _fake_result(
        stdout="auth error details SECRET", stderr="stderr SECRET", returncode=1
    )
    with pytest.raises(RuntimeError) as exc_info:
        _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)
    msg = str(exc_info.value)
    assert "SECRET" not in msg
    assert "rc=1" in msg or "1" in msg


def test_vast_rc0_non_json_raises_without_content(monkeypatch):
    """rc=0 but non-JSON stdout raises RuntimeError without echoing stdout."""
    fake_run = lambda cmd, **kw: _fake_result(
        stdout="this is not json and has SECRET data", returncode=0
    )
    with pytest.raises(RuntimeError) as exc_info:
        _vast.balance(_VAST_CREDS, NOW, run_cmd=fake_run)
    msg = str(exc_info.value)
    assert "SECRET" not in msg


# ===========================================================================
# Fireworks
# ===========================================================================

_FW_CREDS = {
    "FIREWORKS_API_KEY": "fw-key",
    "FIREWORKS_PREPAID_ACCOUNT_IDS": "pollinations",
}

_FW_ACCOUNT_LIST = '{"accounts": [{"name": "accounts/pollinations"}, {"name": "accounts/org2"}]}'
_FW_GET_POLLINATIONS = "Name: pollinations\nBalance: USD 55.00\nStatus: active"
_FW_GET_ORG2 = "Name: org2\nBalance: USD 200.00\nStatus: active"


def _fw_run(cmd, **kw):
    if "list" in cmd:
        return _fake_result(stdout=_FW_ACCOUNT_LIST)
    # account get — choose by --account-id arg
    idx = cmd.index("--account-id") + 1
    acct = cmd[idx]
    if acct == "pollinations":
        return _fake_result(stdout=_FW_GET_POLLINATIONS)
    return _fake_result(stdout=_FW_GET_ORG2)


def test_fireworks_balance_row():
    """pollinations → prepaid; org2 → left (grant)."""
    row = _fw.balance(_FW_CREDS, NOW, run_cmd=_fw_run)
    assert row["provider"] == "fireworks"
    assert row["prepaid_left_usd"] == 55.0
    assert row["left_usd"] == 200.0
    assert row["granted_usd"] is None
    assert row["spent_usd"] is None
    assert row["source"] == "cli"
    assert row["run_at"] == NOW


def test_fireworks_default_prepaid_account():
    """Default FIREWORKS_PREPAID_ACCOUNT_IDS is 'pollinations'."""
    creds = {"FIREWORKS_API_KEY": "fw-key"}
    row = _fw.balance(creds, NOW, run_cmd=_fw_run)
    assert row["prepaid_left_usd"] == 55.0
    assert row["left_usd"] == 200.0


def test_fireworks_single_account_all_grant():
    """If all accounts are grant (none in prepaid list), left = total."""
    creds = {"FIREWORKS_API_KEY": "fw-key", "FIREWORKS_PREPAID_ACCOUNT_IDS": "other"}
    row = _fw.balance(creds, NOW, run_cmd=_fw_run)
    assert row["prepaid_left_usd"] == 0.0
    assert row["left_usd"] == 255.0  # 55 + 200


def test_fireworks_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _fw.balance({}, NOW, run_cmd=_fw_run)


def test_fireworks_cli_failure_raises():
    fake_run = lambda cmd, **kw: _fake_result(returncode=1, stderr="auth error")
    with pytest.raises(RuntimeError):
        _fw.balance(_FW_CREDS, NOW, run_cmd=fake_run)


# ===========================================================================
# OpenAI
# ===========================================================================

_OAI_CREDS = {"OPENAI_ADMIN_KEY": "sk-admin-test"}


def _make_oai_page(amounts, has_more=False, next_page=None):
    buckets = [
        {"results": [{"amount": {"value": a, "currency": "usd"}}]}
        for a in amounts
    ]
    d = {"data": buckets, "has_more": has_more}
    if next_page:
        d["next_page"] = next_page
    return d


def test_openai_single_page(monkeypatch):
    """Single page: spent = sum of bucket amounts."""
    page = _make_oai_page([100.0, 200.5, 50.0])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    row = _oai.balance(_OAI_CREDS, NOW)
    assert row["provider"] == "openai"
    assert row["spent_usd"] == pytest.approx(350.5, abs=0.01)
    assert row["granted_usd"] == pytest.approx(1565.58, abs=0.01)
    assert row["left_usd"] == pytest.approx(1565.58 - 350.5, abs=0.01)
    assert row["source"] == "api"
    assert "granted is HC" in row["note"]


def test_openai_two_page_pagination(monkeypatch):
    """Two pages: amounts summed across both."""
    page1 = _make_oai_page([300.0, 100.0], has_more=True, next_page="tok2")
    page2 = _make_oai_page([50.0, 25.5], has_more=False)
    cap = Capture([page1, page2])
    monkeypatch.setattr(_oai, "http_json", cap)
    row = _oai.balance(_OAI_CREDS, NOW)
    assert row["spent_usd"] == pytest.approx(475.5, abs=0.01)
    assert len(cap.calls) == 2


def test_openai_second_page_uses_next_page_token(monkeypatch):
    """next_page cursor must be sent as the 'page' query param on subsequent requests."""
    page1 = _make_oai_page([100.0], has_more=True, next_page="cursor-abc")
    page2 = _make_oai_page([50.0], has_more=False)
    cap = Capture([page1, page2])
    monkeypatch.setattr(_oai, "http_json", cap)
    _oai.balance(_OAI_CREDS, NOW)
    assert "page=cursor-abc" in cap.calls[1]["url"]


def test_openai_custom_grant(monkeypatch):
    """OPENAI_GRANT_USD / OPENAI_GRANT_START from creds dict override defaults."""
    import datetime
    page = _make_oai_page([10.0])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    creds = {
        "OPENAI_ADMIN_KEY": "sk-test",
        "OPENAI_GRANT_USD": "2000.00",
        "OPENAI_GRANT_START": "2026-01-01",
    }
    row = _oai.balance(creds, NOW)
    assert row["granted_usd"] == 2000.0
    # start_time must be the UTC epoch of the custom start date
    expected_epoch = str(int(
        datetime.datetime.fromisoformat("2026-01-01")
        .replace(tzinfo=datetime.timezone.utc)
        .timestamp()
    ))
    assert expected_epoch in cap.calls[0]["url"]


def test_openai_bearer_header(monkeypatch):
    """Authorization: Bearer <key> must be sent."""
    page = _make_oai_page([0.0])
    cap = Capture([page])
    monkeypatch.setattr(_oai, "http_json", cap)
    _oai.balance({"OPENAI_ADMIN_KEY": "sk-secret"}, NOW)
    assert cap.calls[0]["headers"].get("Authorization") == "Bearer sk-secret"


def test_openai_missing_key_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _oai.balance({}, NOW)


# ===========================================================================
# Azure
# ===========================================================================

_AZ_CREDS = {
    "AZURE_TENANT_ID": "tenant-abc",
    "AZURE_CLIENT_ID": "client-xyz",
    "AZURE_CLIENT_SECRET": "secret-123",
    "AZURE_BILLING_ACCOUNT": "ba-001",
    "AZURE_BILLING_PROFILE": "bp-001",
}

_AZ_TOKEN_RESP = {"access_token": "Bearer-tok-999", "token_type": "Bearer", "expires_in": 3599}

_AZ_BALANCE_RESP = {
    "properties": {
        "balanceSummary": {
            "estimatedBalance": {"value": 239965.88, "currency": "USD"},
            "currentBalance": {"value": 244594.18, "currency": "USD"},
        }
    }
}


def test_azure_two_hop(monkeypatch):
    """Token POST then balance GET; left = estimatedBalance.value."""
    cap = Capture([_AZ_TOKEN_RESP, _AZ_BALANCE_RESP])
    monkeypatch.setattr(_az, "http_json", cap)
    row = _az.balance(_AZ_CREDS, NOW)
    assert row["provider"] == "azure"
    assert row["left_usd"] == pytest.approx(239965.88, abs=0.01)
    assert row["source"] == "api"
    assert row["run_at"] == NOW
    assert len(cap.calls) == 2


def test_azure_token_post_form_encoded(monkeypatch):
    """First call must be a POST with form-encoded bytes body."""
    cap = Capture([_AZ_TOKEN_RESP, _AZ_BALANCE_RESP])
    monkeypatch.setattr(_az, "http_json", cap)
    _az.balance(_AZ_CREDS, NOW)
    token_call = cap.calls[0]
    assert isinstance(token_call["data"], bytes), "token POST body must be bytes (form-encoded)"
    body_str = token_call["data"].decode()
    assert "grant_type=client_credentials" in body_str
    assert "client_id=client-xyz" in body_str
    assert "client_secret=secret-123" in body_str


def test_azure_bearer_on_balance_get(monkeypatch):
    """Second call must carry Authorization: Bearer <access_token>."""
    cap = Capture([_AZ_TOKEN_RESP, _AZ_BALANCE_RESP])
    monkeypatch.setattr(_az, "http_json", cap)
    _az.balance(_AZ_CREDS, NOW)
    balance_call = cap.calls[1]
    assert balance_call["headers"].get("Authorization") == "Bearer Bearer-tok-999"


def test_azure_billing_ids_in_url(monkeypatch):
    """Billing account and profile IDs must appear in the balance URL."""
    cap = Capture([_AZ_TOKEN_RESP, _AZ_BALANCE_RESP])
    monkeypatch.setattr(_az, "http_json", cap)
    _az.balance(_AZ_CREDS, NOW)
    url = cap.calls[1]["url"]
    assert "ba-001" in url
    assert "bp-001" in url
    assert "balanceSummary" in url


def test_azure_note_contains_current_balance(monkeypatch):
    """Note must include currentBalance cross-check value."""
    cap = Capture([_AZ_TOKEN_RESP, _AZ_BALANCE_RESP])
    monkeypatch.setattr(_az, "http_json", cap)
    row = _az.balance(_AZ_CREDS, NOW)
    assert "244594" in row["note"] or "244594.18" in row["note"]


def test_azure_missing_creds_raises():
    with pytest.raises((RuntimeError, KeyError)):
        _az.balance({}, NOW)


def test_b4_slugs_in_canonical():
    """All B4 slugs must be in CANONICAL."""
    for slug in ("ovhcloud", "vast.ai", "fireworks", "openai", "azure"):
        assert slug in registry.CANONICAL, f"slug not in CANONICAL: {slug}"
