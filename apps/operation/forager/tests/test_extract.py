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

LAMBDA_ZERO_DUE = """\
Lambda invoice
Invoice number: LAMBDA-062026
Date: June 29, 2026
Sub Total $384.47
Promotional Credits ($384.47)
Amount Due $0.00
Status PAID
Discounts/credits applied on this invoice
Promotional Credits ($384.47)
"""

GENERIC_PRECEDENCE = """\
Invoice no. GEN-003
Date: July 1, 2026
Sub Total $999.00
Invoice Amount $12.34
Amount Paid $56.78
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


def test_generic_amount_due_beats_subtotal_and_captures_credit():
    """Lambda-style credit invoice stores amount due, plus applied credits."""
    out = extract.parse(LAMBDA_ZERO_DUE, "lambda", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert out["status"] == "parsed"
    assert inv["period_month"] == "2026-06"
    assert inv["amount"] == 0.0
    assert inv["credit_usd"] == 384.47


def test_generic_amount_precedence_invoice_amount_before_total():
    out = extract.parse(GENERIC_PRECEDENCE, "runpod", _stub_config(), "2026-07-02")
    inv = out["invoice"]
    assert inv["amount"] == 12.34
    assert inv["period_month"] == "2026-07"


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

def test_ingested_at_is_datetime():
    """extract_and_push ingested_at must be a 'YYYY-MM-DD HH:MM:SS' DateTime string."""
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
        # Must match full DateTime format YYYY-MM-DD HH:MM:SS
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", row["ingested_at"]), \
            f"ingested_at should be 'YYYY-MM-DD HH:MM:SS' but got: {row['ingested_at']!r}"
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


def test_extract_and_push_carries_credit_usd(monkeypatch, tmp_path):
    p = tmp_path / "lambda.pdf"
    p.write_bytes(b"%PDF-LAMBDA")
    monkeypatch.setattr(extract, "pdf_text", lambda path: LAMBDA_ZERO_DUE)

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    row = extract.extract_and_push(
        StubTB(), str(p), "lambda", "compute", "msg003", "email",
        _stub_config(), "2026-07-02", billing_map={"lambda": "monthly_bill"}
    )

    assert row["amount"] == 0.0
    assert row["credit_usd"] == 384.47
    assert appended[0]["credit_usd"] == 384.47


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
# label.py: push-path test (Finding A)
# ---------------------------------------------------------------------------

def test_label_push_path_appends_parsed_row(monkeypatch):
    """label.main() with injected tb stub appends exactly one 'parsed' row to 'invoices'."""
    import ingest.creds as creds_mod
    from ingest.invoices import label

    _fake_credits = {
        "pools": [
            {"name": "GPU pool", "billing": "prepaid", "providers": ["runpod", "vast.ai"]},
            {"name": "Cloud", "billing": "monthly", "providers": ["aws", "google"]},
        ]
    }
    _fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: _fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: _fake_config)

    appended = {}

    class StubTB:
        def sql(self, query):
            return []  # no existing row for this sha256

        def append(self, datasource, rows):
            appended["datasource"] = datasource
            appended["rows"] = rows

    result = label.main([
        "deadbeef1234sha256",
        "--provider", "vast.ai",
        "--month", "2026-06",
        "--amount", "500",
        "--credit", "12.5",
        "--currency", "EUR",
        "--kind", "prepaid_topup",
    ], tb=StubTB())

    # One row appended to "invoices"
    assert appended["datasource"] == "invoices"
    assert len(appended["rows"]) == 1
    row = appended["rows"][0]

    assert row["status"] == "parsed"
    assert row["provider"] == "vast.ai"
    assert row["source"] == "label"
    # amount_usd was dropped from the schema — the row keeps the native
    # amount + currency; USD is reconstructed in SQL at read time
    assert row["amount"] == 500.0
    assert row["currency"] == "EUR"
    assert row["credit_usd"] == 12.5


def test_label_carries_existing_credit_when_omitted(monkeypatch):
    """A label row keeps credit_usd from the existing best row unless overridden."""
    import ingest.creds as creds_mod
    from ingest.invoices import label

    _fake_credits = {
        "pools": [
            {"name": "Lambda", "billing": "monthly", "providers": ["lambda"]},
        ]
    }
    _fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: _fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: _fake_config)

    appended = {}

    class StubTB:
        def sql(self, query):
            return [{
                "sha256": "sha-credit", "status": "parsed", "source": "email",
                "provider": "lambda", "category": "compute", "currency": "USD",
                "credit_usd": 384.47, "file_ref": "/tmp/lambda.pdf",
                "issued_at": "2026-06-29", "ingested_at": "2026-07-01 00:00:00",
            }]

        def append(self, datasource, rows):
            appended["datasource"] = datasource
            appended["rows"] = rows

    label.main([
        "sha-credit",
        "--provider", "lambda",
        "--month", "2026-06",
        "--amount", "0",
        "--currency", "USD",
        "--kind", "monthly_bill",
    ], tb=StubTB())

    assert appended["rows"][0]["credit_usd"] == 384.47


# ---------------------------------------------------------------------------
# Finding C — invoice dedupe helper
# ---------------------------------------------------------------------------

def test_dedupe_invoices_prefers_parsed_over_needs_label():
    """dedupe_invoices keeps the 'parsed' row when both statuses exist for same sha256."""
    from ingest import run as run_mod

    rows = [
        {"sha256": "abc", "status": "needs_label", "ingested_at": "2026-06-01"},
        {"sha256": "abc", "status": "parsed",      "ingested_at": "2026-06-15"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 1
    assert result[0]["status"] == "parsed"


def test_dedupe_invoices_tie_break_latest_ingested_at():
    """When two rows have same status, the later ingested_at wins."""
    from ingest import run as run_mod

    rows = [
        {"sha256": "xyz", "status": "parsed", "ingested_at": "2026-06-01"},
        {"sha256": "xyz", "status": "parsed", "ingested_at": "2026-06-20"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 1
    assert result[0]["ingested_at"] == "2026-06-20"


def test_dedupe_invoices_label_beats_same_day_parsed():
    """A source='label' row wins over a machine 'parsed' row even on the same
    ingested_at date and regardless of input order (the enty-import bug:
    provider 'other' sorts before 'vast.ai', so first-seen won the tie)."""
    from ingest import run as run_mod

    machine = {"sha256": "abc", "status": "parsed", "source": "email",
               "provider": "other", "ingested_at": "2026-07-03"}
    label = {"sha256": "abc", "status": "parsed", "source": "label",
             "provider": "vast.ai", "ingested_at": "2026-07-03"}
    for rows in ([machine, label], [label, machine]):
        result = run_mod.dedupe_invoices(rows)
        assert len(result) == 1
        assert result[0]["provider"] == "vast.ai"


def test_dedupe_invoices_no_overlap():
    """Different sha256s are all preserved."""
    from ingest import run as run_mod

    rows = [
        {"sha256": "aaa", "status": "parsed",      "ingested_at": "2026-06-01"},
        {"sha256": "bbb", "status": "needs_label",  "ingested_at": "2026-06-01"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 2


# ---------------------------------------------------------------------------
# Finding E — invalid date validation in extract_and_push
# ---------------------------------------------------------------------------

def test_extract_invalid_issued_at_falls_back_to_period_month():
    """Parser returning issued_at='2026-13-00' falls back to period_month + '-01'."""
    import unittest.mock as mock
    import ingest.creds as creds_mod
    import tempfile

    bad_parse_result = {
        "invoice": {
            "provider": "runpod", "kind": "prepaid_topup", "currency": "USD",
            "amount": 100.0, "amount_usd": 100.0,
            "period_month": "2026-05", "invoice_number": "",
            "issued_at": "2026-13-00",
            "status": "parsed",
        },
        "extras": {},
        "status": "parsed",
    }

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    _fake_credits = {"pools": [{"name": "GPU", "billing": "prepaid", "providers": ["runpod"]}]}

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"%PDF")
        pdf_path = f.name

    try:
        with mock.patch.object(extract, "pdf_text", return_value=""), \
             mock.patch.object(extract, "parse", return_value=bad_parse_result), \
             mock.patch.object(creds_mod, "_sops_decrypt", return_value=_fake_credits):
            row = extract.extract_and_push(
                StubTB(), pdf_path, "runpod", "compute", "msg", "email",
                _stub_config(), "2026-06-01"
            )
        # issued_at must be a valid date, falling back to period_month + "-01"
        assert row["issued_at"] == "2026-05-01", f"Expected '2026-05-01', got {row['issued_at']!r}"
    finally:
        os.unlink(pdf_path)


def test_extract_invalid_period_month_falls_back_to_sentinel():
    """Parser returning period_month='2026-13' (invalid month) triggers sentinel '1970-01-01'."""
    import unittest.mock as mock
    import ingest.creds as creds_mod
    import tempfile

    bad_parse_result = {
        "invoice": {
            "provider": "runpod", "kind": "prepaid_topup", "currency": "USD",
            "amount": 100.0, "amount_usd": 100.0,
            "period_month": "2026-13", "invoice_number": "",
            "issued_at": "",
            "status": "parsed",
        },
        "extras": {},
        "status": "parsed",
    }

    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.extend(rows)

    _fake_credits = {"pools": []}

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"%PDF")
        pdf_path = f.name

    try:
        with mock.patch.object(extract, "pdf_text", return_value=""), \
             mock.patch.object(extract, "parse", return_value=bad_parse_result), \
             mock.patch.object(creds_mod, "_sops_decrypt", return_value=_fake_credits):
            row = extract.extract_and_push(
                StubTB(), pdf_path, "runpod", "compute", "msg", "email",
                _stub_config(), "2026-06-01"
            )
        # Invalid period_month → treated as missing → issued_at sentinel
        assert row["issued_at"] == "1970-01-01", f"Expected '1970-01-01', got {row['issued_at']!r}"
        assert row["period_month"] == "", f"Expected empty period_month, got {row['period_month']!r}"
    finally:
        os.unlink(pdf_path)


def test_reparse_invoices_dry_run_reports_credit_diff(monkeypatch, tmp_path, capsys):
    from ingest import run as run_mod

    archive = tmp_path / "archive"
    month_dir = archive / "2026-06"
    month_dir.mkdir(parents=True)
    pdf = month_dir / "lambda_2026-06_msg_invoice.pdf"
    pdf.write_bytes(b"%PDF-LAMBDA")

    monkeypatch.setattr(run_mod._extract, "pdf_text", lambda path: LAMBDA_ZERO_DUE)
    monkeypatch.setattr(
        run_mod.creds,
        "load_credits",
        lambda: {"pools": [{"pool": "Lambda", "billing": "monthly", "providers": ["lambda"]}]},
    )

    class StubTB:
        def sql(self, query):
            return [{
                "sha256": hashlib.sha256(b"%PDF-LAMBDA").hexdigest(),
                "provider": "lambda",
                "category": "compute",
                "kind": "monthly_bill",
                "period_month": "2026-06",
                "amount": 384.47,
                "currency": "USD",
                "amount_usd": 384.47,
                "credit_usd": 0.0,
                "invoice_number": "old",
                "issued_at": "2026-06-29",
                "source": "email",
                "file_ref": str(pdf),
                "status": "parsed",
                "ingested_at": "2026-07-01 00:00:00",
            }]

        def append(self, datasource, rows):
            raise AssertionError("dry-run must not append")

    stats = run_mod.reparse_invoices(
        {"archive_dir": str(archive), "fx_eur_usd": 1.14},
        StubTB(),
        "2026-07-02",
        dry_run=True,
    )

    assert stats["changed"] == 1
    assert stats["appended"] == 0
    out = capsys.readouterr().out
    assert "384.47/0.00 -> parsed 0.00/384.47" in out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stub_config():
    return {"fx_eur_usd": 1.14}
