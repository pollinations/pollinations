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
# Helpers
# ---------------------------------------------------------------------------

def _stub_config():
    return {"fx_eur_usd": 1.14}
