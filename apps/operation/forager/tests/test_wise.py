"""Tests for ingest.wise — the Wise Activities transactions builder.
All hermetic — monkeypatch fetch_month/http_json, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_wise.py -q
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest import wise


def activity(**over):
    base = {
        "id": 1,
        "status": "COMPLETED",
        "type": "CARD_PAYMENT",
        "title": "RunPod",
        "description": "",
        "primaryAmount": "- 100 EUR",
        "secondaryAmount": "",
        "createdOn": "2026-07-01T10:30:00Z",
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# parse_amount / settled_amount
# ---------------------------------------------------------------------------

def test_parse_amount_strips_html_and_separators():
    assert wise.parse_amount("<positive>+ 1,234.56 EUR</positive>") == (1234.56, "EUR")
    assert wise.parse_amount("- 500 USD") == (500.0, "USD")
    assert wise.parse_amount("") == (0.0, "")
    assert wise.parse_amount("EUR") == (0.0, "")


def test_settled_amount_prefers_the_eur_leg():
    primary_eur = activity(primaryAmount="- 163.63 EUR", secondaryAmount="- 180 USD")
    assert wise.settled_amount(primary_eur) == (163.63, "EUR")

    secondary_eur = activity(primaryAmount="- 180 USD", secondaryAmount="- 163.63 EUR")
    assert wise.settled_amount(secondary_eur) == (163.63, "EUR")

    no_eur = activity(primaryAmount="- 180 USD", secondaryAmount="")
    assert wise.settled_amount(no_eur) == (180.0, "USD")


# ---------------------------------------------------------------------------
# transaction_for: filtering
# ---------------------------------------------------------------------------

def test_card_check_and_pending_and_inflows_skipped():
    assert wise.transaction_for(activity(type="CARD_CHECK")) is None
    assert wise.transaction_for(activity(status="PENDING")) is None
    assert wise.transaction_for(activity(status="CANCELLED")) is None
    assert (
        wise.transaction_for(
            activity(primaryAmount="<positive>+ 200 EUR</positive>")
        )
        is None
    )


def test_in_progress_kept():
    row = wise.transaction_for(activity(status="IN_PROGRESS"))
    assert row is not None
    assert row["charged_amount"] == 100.0


def test_zero_amount_skipped():
    assert wise.transaction_for(activity(primaryAmount="- 0 EUR")) is None


# ---------------------------------------------------------------------------
# transaction_for: row shape and classification
# ---------------------------------------------------------------------------

def test_row_shape_and_date():
    row = wise.transaction_for(activity(title="<strong>RunPod</strong>"))
    assert row == {
        "date": "2026-07-01",
        "vendor": "runpod",
        "category": "compute",
        "charged_amount": 100.0,
        "charged_currency": "EUR",
    }


def test_unmatched_counterparty_keeps_empty_vendor():
    row = wise.transaction_for(activity(title="Some Unknown Shop"))
    assert row["vendor"] == ""
    assert row["category"] == "other"


def test_category_rules_use_title_and_description():
    subscription = wise.transaction_for(
        activity(title="Anthropic", description="Claude.ai subscription")
    )
    assert subscription["vendor"] == "anthropic"
    assert subscription["category"] == "saas"

    api = wise.transaction_for(activity(title="Anthropic", description="API"))
    assert api["category"] == "compute"


def test_payroll_stays_visible():
    row = wise.transaction_for(activity(title="LETS DEEL LTD"))
    assert row["vendor"] == "deel"
    assert row["category"] == "payroll"


def test_amount_rules_catch_fixed_price_seats():
    # Max seats are flat 90/180 EUR but Wise sometimes titles them bare
    # 'Anthropic' — indistinguishable from API recharges except by price.
    seat = wise.transaction_for(activity(title="Anthropic", primaryAmount="- 180 EUR"))
    assert seat["category"] == "saas"

    recharge = wise.transaction_for(activity(title="Anthropic", primaryAmount="- 13.45 EUR"))
    assert recharge["category"] == "compute"


def test_rule_precedence_keyword_then_amount_then_default():
    # A keyword hit decides regardless of amount.
    assert (
        wise.category_for("anthropic", "claude.ai subscription", 13.45) == "saas"
    )
    # No keyword: the exact seat price decides.
    assert wise.category_for("anthropic", "anthropic", 180.0) == "saas"
    # Neither: the vendor default.
    assert wise.category_for("anthropic", "anthropic", 217.87) == "compute"


# ---------------------------------------------------------------------------
# build_transactions
# ---------------------------------------------------------------------------

def test_build_transactions_collects_and_validates(monkeypatch):
    monkeypatch.setattr(
        wise,
        "fetch_month",
        lambda secrets, month: [
            activity(id=1, title="RunPod", createdOn=f"{month}-02T00:00:00Z"),
            activity(id=2, type="CARD_CHECK"),
            activity(id=3, title="Google Cloud EMEA", primaryAmount="- 2,500.10 EUR",
                     createdOn=f"{month}-15T08:00:00Z"),
        ],
    )
    rows = wise.build_transactions({}, ["2026-06", "2026-07"])
    assert len(rows) == 4
    assert {row["vendor"] for row in rows} == {"runpod", "google"}
    assert rows[1]["charged_amount"] == 2500.10
    assert rows[2]["date"] == "2026-07-02"


def test_validate_rows_rejects_bad_rows():
    good = {
        "date": "2026-07-01",
        "vendor": "",
        "category": "other",
        "charged_amount": 1.0,
        "charged_currency": "EUR",
    }
    wise.validate_rows([good])
    with pytest.raises(ValueError):
        wise.validate_rows([{**good, "vendor": "not-a-vendor"}])
    with pytest.raises(ValueError):
        wise.validate_rows([{**good, "category": "weird"}])
    with pytest.raises(ValueError):
        wise.validate_rows([{**good, "date": "2026-07"}])
    with pytest.raises(ValueError):
        wise.validate_rows([{**good, "charged_currency": ""}])


# ---------------------------------------------------------------------------
# unmatched_flag
# ---------------------------------------------------------------------------

def test_unmatched_flag_is_empty_when_all_rows_match():
    assert wise.unmatched_flag([]) == ""


def test_unmatched_flag_gives_agent_ready_fix_instructions():
    row = {
        "date": "2026-06-08",
        "vendor": "",
        "category": "other",
        "charged_amount": 4428.17,
        "charged_currency": "EUR",
    }
    flag = wise.unmatched_flag([(row, "SOME NEW SHOP"), (row, "SOME NEW SHOP")])
    assert "2 rows have no vendor match" in flag
    assert "config/vendor_aliases.json" in flag
    assert "ingest.run --only transactions" in flag
    assert '"SOME NEW SHOP" — 2 row(s), e.g. 2026-06-08 4428.17 EUR' in flag


def test_build_transactions_prints_the_unmatched_flag(monkeypatch, capsys):
    monkeypatch.setattr(
        wise,
        "fetch_month",
        lambda secrets, month: [activity(title="Some Unknown Shop")],
    )
    wise.build_transactions({}, ["2026-07"])
    out = capsys.readouterr().out
    assert "no vendor match" in out
    assert '"Some Unknown Shop"' in out


# ---------------------------------------------------------------------------
# fetch_month: pagination + creds guard
# ---------------------------------------------------------------------------

def test_fetch_month_requires_creds():
    with pytest.raises(RuntimeError, match="WISE_API_TOKEN"):
        wise.fetch_month({}, "2026-07")


# ---------------------------------------------------------------------------
# SCA signing + challenge retry
# ---------------------------------------------------------------------------

def _throwaway_keypair(tmp_path):
    import subprocess

    private = tmp_path / "key.pem"
    public = tmp_path / "key.pub"
    subprocess.run(
        ["openssl", "genrsa", "-out", str(private), "2048"],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["openssl", "rsa", "-in", str(private), "-pubout", "-out", str(public)],
        check=True,
        capture_output=True,
    )
    return private.read_text(), public


def test_sign_sca_produces_a_verifiable_signature(tmp_path):
    import base64
    import subprocess

    private_pem, public = _throwaway_keypair(tmp_path)
    signature = wise.sign_sca("one-time-token", private_pem)

    sig_file = tmp_path / "sig.bin"
    sig_file.write_bytes(base64.b64decode(signature))
    verify = subprocess.run(
        [
            "openssl", "dgst", "-sha256",
            "-verify", str(public),
            "-signature", str(sig_file),
        ],
        input=b"one-time-token",
        capture_output=True,
    )
    assert verify.returncode == 0, verify.stderr


def test_sign_sca_raises_on_bad_key():
    with pytest.raises(RuntimeError, match="SCA signing failed"):
        wise.sign_sca("token", "not a pem key")


def _http_403(url, ott=None):
    import email.message
    import urllib.error

    headers = email.message.Message()
    if ott:
        headers["x-2fa-approval"] = ott
    return urllib.error.HTTPError(url, 403, "Forbidden", headers, None)


def test_http_json_sca_signs_the_challenge_and_retries(monkeypatch):
    calls = []

    def fake_http_json(url, headers=None, **_):
        calls.append(headers)
        if len(calls) == 1:
            raise _http_403(url, ott="challenge-token")
        return {"transactions": [{"ok": True}]}

    monkeypatch.setattr(wise, "http_json", fake_http_json)
    monkeypatch.setattr(wise, "sign_sca", lambda token, key: f"sig({token})")

    data = wise.http_json_sca(
        "https://api.wise.com/x",
        {"WISE_API_TOKEN": "t", "WISE_SCA_PRIVATE_KEY": "pem"},
    )
    assert data == {"transactions": [{"ok": True}]}
    assert calls[1]["x-2fa-approval"] == "challenge-token"
    assert calls[1]["X-Signature"] == "sig(challenge-token)"


def test_http_json_sca_requires_the_private_key(monkeypatch):
    def fake_http_json(url, headers=None, **_):
        raise _http_403(url, ott="challenge-token")

    monkeypatch.setattr(wise, "http_json", fake_http_json)
    with pytest.raises(RuntimeError, match="WISE_SCA_PRIVATE_KEY missing"):
        wise.http_json_sca("https://api.wise.com/x", {"WISE_API_TOKEN": "t"})


def test_http_json_sca_reraises_plain_403(monkeypatch):
    import urllib.error

    def fake_http_json(url, headers=None, **_):
        raise _http_403(url)

    monkeypatch.setattr(wise, "http_json", fake_http_json)
    with pytest.raises(urllib.error.HTTPError):
        wise.http_json_sca(
            "https://api.wise.com/x",
            {"WISE_API_TOKEN": "t", "WISE_SCA_PRIVATE_KEY": "pem"},
        )


def test_fetch_month_follows_cursor(monkeypatch):
    calls = []

    def fake_http_json(url, headers=None, **_):
        calls.append(url)
        if "nextCursor" in url:
            return {"activities": [activity(id=2)], "cursor": None}
        return {"activities": [activity(id=1)], "cursor": "page-2"}

    monkeypatch.setattr(wise, "http_json", fake_http_json)
    acts = wise.fetch_month(
        {"WISE_API_TOKEN": "t", "WISE_BUSINESS_PROFILE_ID": "p"}, "2026-07"
    )
    assert [a["id"] for a in acts] == [1, 2]
    assert len(calls) == 2
    assert "since=2026-07-01" in calls[0]
    assert "until=2026-08-01" in calls[0]
    assert "nextCursor=page-2" in calls[1]
