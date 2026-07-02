"""Invoice extraction tests. All hermetic — monkeypatch pdf_text, no sops, no network.
Run: cd apps/operation/treasury && python3 -m pytest tests/ -q
"""
import hashlib, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingest.invoices import extract

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

AIT = """\
AUTOMAT-IT ADVANCED TECHNOLOGIES LTD

    BILLING PERIOD: 01/05/2026

Tax Invoice- AIT-777

    INVOICE TOTAL  EUR 1,234.56

    Credits Used   EUR 0.87  -1,000.00 ea  -2,000.00

    Your remaining credits are 9,999 EUR
"""

STRIPE_RECEIPT = """\
Receipt number:  RCPT-9876-XYZ
Date paid:  June 1, 2026
Amount paid  $42.00
Thanks for paying Anthropic.
"""

STRIPE_INVOICE = """\
Invoice number  INV-2026-001
Date due: May 15, 2026
Total  $150.00
"""

NEEDS_LABEL_TEXT = "Thanks for your purchase! We appreciate your business."

GENERIC_WITH_FULL_DATE = """\
Invoice no. GEN-001
Date: 2026-05-15
Total  $99.00
"""

GENERIC_WITHOUT_FULL_DATE = """\
Invoice no. GEN-002
Billing period: May 2026
Total  $50.00
"""


# ---------------------------------------------------------------------------
# Automat-IT parser tests
# ---------------------------------------------------------------------------

def test_automat_it_amount_period_number(monkeypatch, tmp_path):
    p = tmp_path / "ait.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: AIT)

    out = extract.parse(AIT, "aws", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv is not None
    assert inv["period_month"] == "2026-05"
    assert inv["amount"] == 1234.56
    assert inv["currency"] == "EUR"
    assert inv["invoice_number"] == "AIT-777"
    assert out["status"] == "parsed"


def test_automat_it_note_has_credit_figures(monkeypatch, tmp_path):
    p = tmp_path / "ait.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: AIT)

    out = extract.parse(AIT, "aws", _stub_config(), "2026-07-02")
    extras = out.get("extras", {})
    assert "ait_credit_eur" in extras
    assert extras["ait_credit_eur"] == 2000.0
    assert "ait_credits_left_eur" in extras
    assert extras["ait_credits_left_eur"] == 9999.0


# ---------------------------------------------------------------------------
# Stripe receipt parser tests
# ---------------------------------------------------------------------------

def test_stripe_receipt_amount_period(monkeypatch, tmp_path):
    p = tmp_path / "stripe.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: STRIPE_RECEIPT)

    out = extract.parse(STRIPE_RECEIPT, "anthropic", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv is not None
    assert inv["amount"] == 42.0
    assert inv["currency"] == "USD"
    assert inv["period_month"] == "2026-06"
    assert inv["invoice_number"] == "RCPT-9876-XYZ"
    assert out["status"] == "parsed"


def test_stripe_receipt_issued_at(monkeypatch, tmp_path):
    """stripe_receipt.py emits issued_at as ISO date when Date paid/due is present."""
    out = extract.parse(STRIPE_RECEIPT, "anthropic", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv["issued_at"] == "2026-06-01"


def test_stripe_invoice_issued_at(monkeypatch, tmp_path):
    """stripe_receipt.py emits issued_at for Date due too."""
    out = extract.parse(STRIPE_INVOICE, "elevenlabs", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv["issued_at"] == "2026-05-15"


def test_stripe_invoice_amount_period(monkeypatch, tmp_path):
    p = tmp_path / "stripe2.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: STRIPE_INVOICE)

    out = extract.parse(STRIPE_INVOICE, "elevenlabs", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv is not None
    assert inv["amount"] == 150.0
    assert inv["currency"] == "USD"
    assert inv["period_month"] == "2026-05"
    assert out["status"] == "parsed"


# ---------------------------------------------------------------------------
# Generic parser issued_at tests
# ---------------------------------------------------------------------------

def test_generic_issued_at_from_iso_date(monkeypatch, tmp_path):
    """generic.py emits issued_at when a full ISO date is found."""
    out = extract.parse(GENERIC_WITH_FULL_DATE, "runpod", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv["issued_at"] == "2026-05-15"


def test_generic_no_issued_at_without_full_date(monkeypatch, tmp_path):
    """generic.py does not emit issued_at when only month/year is found (no full date)."""
    out = extract.parse(GENERIC_WITHOUT_FULL_DATE, "runpod", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    # No full date present → extract.py falls back to period_month + "-01"
    # period_month comes from "May 2026" which generic can't parse (no day) — needs_label
    # so issued_at should be "1970-01-01" sentinel
    assert inv["issued_at"] in ("", "1970-01-01")


# ---------------------------------------------------------------------------
# extract.py issued_at defaulting
# ---------------------------------------------------------------------------

def test_extract_issued_at_defaults_to_period_month_day01():
    """When parser omits issued_at but period_month is set, extract.py uses period_month + '-01'."""
    # AIT parser doesn't emit issued_at, has period_month = "2026-05"
    out = extract.parse(AIT, "aws", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    # AIT sets issued_at="" — extract.parse passes it through; extract_and_push handles defaulting
    # We test the full extract_and_push path:
    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    import ingest.creds as creds_mod
    import pytest
    _fake_credits = {"pools": [{"name": "AWS Reseller", "billing": "reseller", "providers": ["aws"]}]}

    # We need to test this via extract_and_push to trigger the defaulting logic
    # Use a scratch approach: call extract_and_push with monkeypatched creds and pdf_text
    import unittest.mock as mock
    import tempfile, pathlib

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"%PDF")
        pdf_path = f.name

    try:
        with mock.patch.object(extract, "pdf_text", return_value=AIT), \
             mock.patch.object(creds_mod, "_sops_decrypt", return_value=_fake_credits):
            row = extract.extract_and_push(
                StubTB(), pdf_path, "aws", "compute", "msg", "email",
                _stub_config(), "2026-07-02"
            )
        assert row["issued_at"] == "2026-05-01"
    finally:
        os.unlink(pdf_path)


def test_extract_issued_at_sentinel_when_no_period():
    """When parser omits issued_at and period_month is empty, extract.py uses '1970-01-01'."""
    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    import ingest.creds as creds_mod
    import unittest.mock as mock
    import tempfile

    _fake_credits = {"pools": []}

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"%PDF")
        pdf_path = f.name

    try:
        with mock.patch.object(extract, "pdf_text", return_value=NEEDS_LABEL_TEXT), \
             mock.patch.object(creds_mod, "_sops_decrypt", return_value=_fake_credits):
            row = extract.extract_and_push(
                StubTB(), pdf_path, "runpod", "compute", "msg", "email",
                _stub_config(), "2026-07-02"
            )
        assert row["issued_at"] == "1970-01-01"
    finally:
        os.unlink(pdf_path)


# ---------------------------------------------------------------------------
# ingested_at format test
# ---------------------------------------------------------------------------

def test_ingested_at_is_date_only():
    """extract_and_push ingested_at must be YYYY-MM-DD (no time component)."""
    import re
    import unittest.mock as mock
    import ingest.creds as creds_mod
    import tempfile

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    _fake_credits = {"pools": []}

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"%PDF")
        pdf_path = f.name

    try:
        with mock.patch.object(extract, "pdf_text", return_value=NEEDS_LABEL_TEXT), \
             mock.patch.object(creds_mod, "_sops_decrypt", return_value=_fake_credits):
            row = extract.extract_and_push(
                StubTB(), pdf_path, "runpod", "compute", "msg", "email",
                _stub_config(), "2026-07-02"
            )
        # Must match YYYY-MM-DD only, no time part
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["ingested_at"]), \
            f"ingested_at should be YYYY-MM-DD but got: {row['ingested_at']!r}"
    finally:
        os.unlink(pdf_path)


# ---------------------------------------------------------------------------
# needs_label: unparseable text still produces a row
# ---------------------------------------------------------------------------

def test_needs_label_when_no_total(monkeypatch, tmp_path):
    p = tmp_path / "y.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: NEEDS_LABEL_TEXT)

    out = extract.parse(NEEDS_LABEL_TEXT, "runpod", _stub_config(), "2026-07-02")
    assert out["status"] == "needs_label"
    inv = out["invoice"]
    assert inv is not None
    assert inv["amount"] == 0.0
    assert inv["period_month"] == ""


# ---------------------------------------------------------------------------
# extract_and_push: needs_label PDF still appends exactly one row
# ---------------------------------------------------------------------------

def test_extract_and_push_needs_label_appends_one_row(monkeypatch, tmp_path):
    p = tmp_path / "z.pdf"
    p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda path: NEEDS_LABEL_TEXT)

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)
            return {"successful_rows": len(rows)}

    extract.extract_and_push(
        StubTB(), str(p), "runpod", "compute", "msg001", "email",
        _stub_config(), "2026-07-02"
    )

    assert len(appended) == 1
    row = appended[0]
    assert row["status"] == "needs_label"
    assert row["sha256"] == hashlib.sha256(b"%PDF").hexdigest()
    assert row["category"] == "compute"
    assert row["amount"] == 0.0


def test_extract_and_push_ait_appends_parsed_row(monkeypatch, tmp_path):
    p = tmp_path / "ait2.pdf"
    p.write_bytes(b"%PDF-AIT")
    monkeypatch.setattr(extract, "pdf_text", lambda path: AIT)

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)
            return {"successful_rows": len(rows)}

    _fake_credits = {
        "pools": [
            {"name": "AWS Reseller", "billing": "reseller", "providers": ["aws"]}
        ]
    }

    import ingest.creds as creds_mod
    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: _fake_credits)

    row = extract.extract_and_push(
        StubTB(), str(p), "aws", "compute", "msg002", "email",
        _stub_config(), "2026-07-02"
    )

    assert len(appended) == 1
    assert row["status"] == "parsed"
    assert row["kind"] == "reseller"
    assert row["amount"] == 1234.56


# ---------------------------------------------------------------------------
# label.py: unknown provider exits nonzero and lists known providers
# ---------------------------------------------------------------------------

def test_label_unknown_provider_exits_with_known_list(monkeypatch, capsys):
    """label.py exits nonzero and prints known provider list for unknown provider."""
    import ingest.creds as creds_mod
    import pytest

    _fake_credits = {
        "pools": [
            {"name": "GPU pool", "billing": "prepaid", "providers": ["runpod", "vast.ai"]},
            {"name": "Cloud", "billing": "monthly", "providers": ["aws", "gcp"]},
        ]
    }
    _fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: _fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: _fake_config)

    from ingest.invoices import label

    with pytest.raises(SystemExit) as exc_info:
        label.main([
            "abc123sha256",
            "--provider", "unknown-provider-xyz",
            "--month", "2026-06",
            "--amount", "100",
            "--currency", "USD",
            "--kind", "prepaid_topup",
        ])

    assert exc_info.value.code != 0

    captured = capsys.readouterr()
    err_output = captured.err
    # Must mention at least one known provider from the pool
    assert "runpod" in err_output or "aws" in err_output or "vast.ai" in err_output or "gcp" in err_output


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stub_config():
    return {"fx_eur_usd": 1.14}
