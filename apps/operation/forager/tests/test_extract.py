"""Invoice AI extraction tests. Hermetic: no network, no real PDF rendering."""

import hashlib
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.invoices import ai_agent, extract


def test_agent_prompt_includes_exact_invoices_datasource():
    prompt = ai_agent._system_prompt()

    assert 'TOKEN "treasury_ingest" APPEND' in prompt
    assert "`period_month` String `json:$.period_month`" in prompt
    assert "`credit_usd` Float64 `json:$.credit_usd`" in prompt
    assert "The runner fills these operational columns" in prompt
    assert "Return exactly these JSON keys" in prompt


def test_agent_schema_is_derived_from_datasource(monkeypatch):
    fake_datasource = """TOKEN "treasury_ingest" APPEND

SCHEMA >
    `sha256` String `json:$.sha256`,
    `vendor_slug` String `json:$.vendor_slug`,
    `net_amount` Float64 `json:$.net_amount`,
    `review_note` String `json:$.review_note`,
    `source` String `json:$.source`,
    `file_ref` String `json:$.file_ref`,
    `ingested_at` DateTime `json:$.ingested_at`

ENGINE "MergeTree"
"""
    monkeypatch.setattr(ai_agent, "datasource_schema_text", lambda: fake_datasource)

    schema = ai_agent.invoice_response_schema()["schema"]

    assert list(schema["properties"].keys()) == [
        "vendor_slug",
        "net_amount",
        "review_note",
    ]
    assert schema["required"] == ["vendor_slug", "net_amount", "review_note"]
    assert schema["properties"]["net_amount"]["type"] == "number"


def test_agent_category_enum_includes_operating_categories():
    category = ai_agent.invoice_response_schema()["schema"]["properties"]["category"]
    assert "admin" in category["enum"]
    assert "office" in category["enum"]


def test_agent_kind_enum_has_only_invoice_business_types():
    kind = ai_agent.invoice_response_schema()["schema"]["properties"]["kind"]
    assert kind["enum"] == ["monthly_bill", "prepaid_topup", "subscription", ""]


def test_agent_prompt_says_payg_is_not_an_invoice_kind():
    prompt = ai_agent._system_prompt()
    assert "Never use payg as an invoice kind" in prompt
    assert "pay-as-you-go provider invoices are monthly_bill" in prompt


def test_ai_agent_extract_pdf_calls_pollinations_each_time(monkeypatch, tmp_path):
    calls = []
    expected = {
        "provider": "runpod",
        "category": "compute",
        "kind": "prepaid_topup",
        "period_month": "2026-06",
        "amount": 42,
        "currency": "USD",
        "invoice_number": "INV-1",
        "issued_at": "2026-06-15",
        "status": "parsed",
        "credit_usd": 0,
    }

    monkeypatch.setattr(
        ai_agent, "render_pdf_pages", lambda *a, **kw: ["data:image/jpeg;base64,abc"]
    )

    def fake_call(*args, **kwargs):
        calls.append(kwargs["file_hash"])
        return expected

    monkeypatch.setattr(ai_agent, "call_pollinations_invoice_agent", fake_call)

    cfg = {"archive_dir": str(tmp_path)}
    pdf = tmp_path / "invoice.pdf"
    pdf.write_bytes(b"%PDF")
    file_hash = hashlib.sha256(b"%PDF").hexdigest()

    first = ai_agent.extract_pdf(str(pdf), file_hash, {}, cfg, "2026-07-03")
    second = ai_agent.extract_pdf(str(pdf), file_hash, {}, cfg, "2026-07-03")

    assert first == expected
    assert second == expected
    assert calls == [file_hash, file_hash]


def test_extract_and_push_calls_ai_and_appends_row(monkeypatch, tmp_path):
    pdf = tmp_path / "runpod.pdf"
    pdf.write_bytes(b"%PDF-RUNPOD")
    seen = {}

    def fake_extract_pdf(path, file_hash, hints, config, today, creds=None):
        seen["path"] = path
        seen["file_hash"] = file_hash
        seen["hints"] = hints
        return {
            "provider": "runpod",
            "category": "compute",
            "kind": "prepaid_topup",
            "period_month": "2026-06",
            "amount": "1,234.50",
            "currency": "USD",
            "invoice_number": "INV-123",
            "issued_at": "2026-06-29",
            "status": "parsed",
            "credit_usd": "12.5",
        }

    monkeypatch.setattr(extract.ai_agent, "extract_pdf", fake_extract_pdf)
    appended = []

    class StubTB:
        def append(self, datasource, rows):
            appended.append((datasource, rows))

    row = extract.extract_and_push(
        StubTB(),
        str(pdf),
        "runpod",
        "compute",
        "msg",
        "email",
        _stub_config(),
        "2026-07-03",
        billing_map={"runpod": "prepaid_topup"},
    )

    assert seen["path"] == str(pdf)
    assert seen["hints"]["kind_hint"] == "prepaid_topup"
    assert row["provider"] == "runpod"
    assert row["category"] == "compute"
    assert row["kind"] == "prepaid_topup"
    assert row["amount"] == 1234.5
    assert row["currency"] == "USD"
    assert row["credit_usd"] == 12.5
    assert row["status"] == "parsed"
    assert appended == [("invoices", [row])]


def test_build_row_from_missing_agent_fields_fails(tmp_path):
    import pytest

    pdf = tmp_path / "bad.pdf"
    pdf.write_bytes(b"%PDF")
    with pytest.raises(RuntimeError, match="missing fields"):
        extract.build_row_from_result(
            str(pdf),
            "sha",
            {"provider": "runpod"},
            "email",
            "2026-07-03",
        )


def test_row_shape_matches_invoices_datasource_columns(tmp_path):
    row = extract.build_row_from_result(
        str(tmp_path / "x.pdf"),
        "sha",
        {
            "provider": "lambda",
            "category": "compute",
            "kind": "monthly_bill",
            "period_month": "2026-06",
            "amount": 0,
            "currency": "USD",
            "invoice_number": "L-1",
            "issued_at": "2026-06-01",
            "status": "parsed",
            "credit_usd": 384.47,
        },
        "email",
        "2026-07-03",
        ingested_at="2026-07-03 12:00:00",
    )

    assert list(row.keys()) == ai_agent.datasource_field_order()
    assert row["issued_at"] == "2026-06-01"


def test_build_row_preserves_known_archive_provider(monkeypatch, tmp_path):
    pdf = tmp_path / "exafunction.pdf"
    pdf.write_bytes(b"%PDF")

    def fake_extract_pdf(*args, **kwargs):
        return {
            "provider": "windsurf",
            "category": "saas",
            "kind": "monthly_bill",
            "period_month": "2026-01",
            "amount": 60,
            "currency": "USD",
            "invoice_number": "INV-1",
            "issued_at": "2026-01-08",
            "status": "parsed",
            "credit_usd": 0,
        }

    monkeypatch.setattr(extract, "extract_pdf", fake_extract_pdf)

    row = extract.build_row(
        str(pdf), "exafunction", "compute", "msg", "agent",
        _stub_config(), "2026-07-03", billing_map={},
    )

    assert row["provider"] == "exafunction"
    assert row["category"] == "saas"


def test_build_row_allows_agent_provider_for_other_archive(monkeypatch, tmp_path):
    pdf = tmp_path / "other.pdf"
    pdf.write_bytes(b"%PDF")

    def fake_extract_pdf(*args, **kwargs):
        return {
            "provider": "zara_home",
            "category": "office",
            "kind": "monthly_bill",
            "period_month": "2026-01",
            "amount": 505.97,
            "currency": "EUR",
            "invoice_number": "80086816820",
            "issued_at": "2026-01-12",
            "status": "parsed",
            "credit_usd": 0,
        }

    monkeypatch.setattr(extract, "extract_pdf", fake_extract_pdf)

    row = extract.build_row(
        str(pdf), "other", "other", "msg", "agent",
        _stub_config(), "2026-07-03", billing_map={},
    )

    assert row["provider"] == "zara_home"
    assert row["category"] == "office"


def test_row_shape_follows_changed_datasource(monkeypatch, tmp_path):
    fake_datasource = """TOKEN "treasury_ingest" APPEND

SCHEMA >
    `sha256` String `json:$.sha256`,
    `vendor_slug` String `json:$.vendor_slug`,
    `net_amount` Float64 `json:$.net_amount`,
    `source` String `json:$.source`,
    `file_ref` String `json:$.file_ref`,
    `ingested_at` DateTime `json:$.ingested_at`

ENGINE "MergeTree"
"""
    monkeypatch.setattr(ai_agent, "datasource_schema_text", lambda: fake_datasource)

    row = extract.build_row_from_result(
        str(tmp_path / "x.pdf"),
        "sha",
        {
            "vendor_slug": "runpod",
            "net_amount": "42.50",
        },
        "email",
        "2026-07-03",
        ingested_at="2026-07-03 12:00:00",
    )

    assert list(row.keys()) == [
        "sha256",
        "vendor_slug",
        "net_amount",
        "source",
        "file_ref",
        "ingested_at",
    ]
    assert row["net_amount"] == 42.5


def test_ingested_at_is_datetime(monkeypatch, tmp_path):
    row = extract.build_row_from_result(
        str(tmp_path / "x.pdf"),
        "sha",
        {
            "provider": "lambda",
            "category": "compute",
            "kind": "monthly_bill",
            "period_month": "2026-06",
            "amount": 0,
            "currency": "USD",
            "invoice_number": "L-1",
            "issued_at": "2026-06-29",
            "status": "parsed",
            "credit_usd": 0,
        },
        "email",
        "2026-07-03",
    )
    date_part, time_part = row["ingested_at"].split(" ")
    assert len(date_part.split("-")) == 3
    assert len(time_part.split(":")) == 3


def test_label_unknown_provider_exits_with_known_list(monkeypatch, capsys):
    """label.py exits nonzero and prints known provider list for unknown provider."""
    import ingest.creds as creds_mod
    import pytest

    fake_credits = {
        "pools": [
            {
                "name": "GPU pool",
                "billing": "prepaid",
                "providers": ["runpod", "vast.ai"],
            },
            {"name": "Cloud", "billing": "monthly", "providers": ["aws", "gcp"]},
        ]
    }
    fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: fake_config)

    from ingest.invoices import label

    with pytest.raises(SystemExit) as exc_info:
        label.main(
            [
                "abc123sha256",
                "--provider",
                "unknown-provider-xyz",
                "--month",
                "2026-06",
                "--amount",
                "100",
                "--currency",
                "USD",
                "--kind",
                "prepaid_topup",
            ]
        )

    assert exc_info.value.code != 0
    err_output = capsys.readouterr().err
    assert (
        "runpod" in err_output
        or "aws" in err_output
        or "vast.ai" in err_output
        or "gcp" in err_output
    )


def test_label_push_path_appends_parsed_row(monkeypatch):
    """label.main() with injected tb stub appends exactly one parsed row."""
    import ingest.creds as creds_mod
    from ingest.invoices import label

    fake_credits = {
        "pools": [
            {
                "name": "GPU pool",
                "billing": "prepaid",
                "providers": ["runpod", "vast.ai"],
            },
            {"name": "Cloud", "billing": "monthly", "providers": ["aws", "google"]},
        ]
    }
    fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: fake_config)

    appended = {}

    class StubTB:
        def sql(self, query):
            return []

        def append(self, datasource, rows):
            appended["datasource"] = datasource
            appended["rows"] = rows

    label.main(
        [
            "deadbeef1234sha256",
            "--provider",
            "vast.ai",
            "--month",
            "2026-06",
            "--amount",
            "500",
            "--credit",
            "12.5",
            "--currency",
            "EUR",
            "--kind",
            "prepaid_topup",
        ],
        tb=StubTB(),
    )

    row = appended["rows"][0]
    assert appended["datasource"] == "invoices"
    assert row["status"] == "parsed"
    assert row["provider"] == "vast.ai"
    assert row["source"] == "label"
    assert row["amount"] == 500.0
    assert row["currency"] == "EUR"
    assert row["credit_usd"] == 12.5


def test_label_ignore_appends_not_invoice_row(monkeypatch):
    import ingest.creds as creds_mod
    from ingest.invoices import label

    fake_credits = {"pools": []}
    fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: fake_config)

    appended = {}

    class StubTB:
        def sql(self, query):
            return [
                {
                    "sha256": "sha-doc",
                    "status": "parsed",
                    "source": "email",
                    "provider": "other",
                    "category": "other",
                    "currency": "USD",
                    "file_ref": "/tmp/doc.pdf",
                    "issued_at": "2026-06-29",
                    "ingested_at": "2026-07-01 00:00:00",
                }
            ]

        def append(self, datasource, rows):
            appended["datasource"] = datasource
            appended["rows"] = rows

    label.main(["sha-doc", "--not-invoice", "--note", "contract"], tb=StubTB())

    row = appended["rows"][0]
    assert row["status"] == "not_invoice"
    assert row["kind"] == ""
    assert row["amount"] == 0.0
    assert row["invoice_number"] == "contract"


def test_label_carries_existing_credit_when_omitted(monkeypatch):
    """A label row keeps credit_usd from the existing best row unless overridden."""
    import ingest.creds as creds_mod
    from ingest.invoices import label

    fake_credits = {
        "pools": [{"name": "Lambda", "billing": "monthly", "providers": ["lambda"]}]
    }
    fake_config = {"fx_eur_usd": 1.14, "tb_ops_api": "https://fake.tinybird.co"}

    monkeypatch.setattr(creds_mod, "_sops_decrypt", lambda p: fake_credits)
    monkeypatch.setattr(creds_mod, "load_config", lambda: fake_config)

    appended = {}

    class StubTB:
        def sql(self, query):
            return [
                {
                    "sha256": "sha-credit",
                    "status": "parsed",
                    "source": "email",
                    "provider": "lambda",
                    "category": "compute",
                    "currency": "USD",
                    "credit_usd": 384.47,
                    "file_ref": "/tmp/lambda.pdf",
                    "issued_at": "2026-06-29",
                    "ingested_at": "2026-07-01 00:00:00",
                }
            ]

        def append(self, datasource, rows):
            appended["datasource"] = datasource
            appended["rows"] = rows

    label.main(
        [
            "sha-credit",
            "--provider",
            "lambda",
            "--month",
            "2026-06",
            "--amount",
            "0",
            "--currency",
            "USD",
            "--kind",
            "monthly_bill",
        ],
        tb=StubTB(),
    )

    assert appended["rows"][0]["credit_usd"] == 384.47


def test_dedupe_invoices_prefers_parsed_over_needs_review():
    from ingest import run as run_mod

    rows = [
        {"sha256": "abc", "status": "needs_review", "ingested_at": "2026-06-01"},
        {"sha256": "abc", "status": "parsed", "ingested_at": "2026-06-15"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 1
    assert result[0]["status"] == "parsed"


def test_dedupe_invoices_tie_break_latest_ingested_at():
    from ingest import run as run_mod

    rows = [
        {"sha256": "xyz", "status": "parsed", "ingested_at": "2026-06-01"},
        {"sha256": "xyz", "status": "parsed", "ingested_at": "2026-06-20"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 1
    assert result[0]["ingested_at"] == "2026-06-20"


def test_dedupe_invoices_label_beats_same_day_parsed():
    from ingest import run as run_mod

    machine = {
        "sha256": "abc",
        "status": "parsed",
        "source": "email",
        "provider": "other",
        "ingested_at": "2026-07-03",
    }
    label = {
        "sha256": "abc",
        "status": "parsed",
        "source": "label",
        "provider": "vast.ai",
        "ingested_at": "2026-07-03",
    }
    for rows in ([machine, label], [label, machine]):
        result = run_mod.dedupe_invoices(rows)
        assert len(result) == 1
        assert result[0]["provider"] == "vast.ai"


def test_dedupe_invoices_no_overlap():
    from ingest import run as run_mod

    rows = [
        {"sha256": "aaa", "status": "parsed", "ingested_at": "2026-06-01"},
        {"sha256": "bbb", "status": "needs_review", "ingested_at": "2026-06-01"},
    ]
    result = run_mod.dedupe_invoices(rows)
    assert len(result) == 2


def test_reparse_invoices_does_not_call_ai(monkeypatch, tmp_path, capsys):
    from ingest import run as run_mod

    archive = tmp_path / "archive"
    month_dir = archive / "2026-06"
    month_dir.mkdir(parents=True)
    pdf = month_dir / "lambda_2026-06_msg_invoice.pdf"
    pdf.write_bytes(b"%PDF-LAMBDA")
    file_hash = hashlib.sha256(b"%PDF-LAMBDA").hexdigest()

    def fail_build_row(*args, **kwargs):
        raise AssertionError("reparse_invoices must not call AI extraction")

    monkeypatch.setattr(run_mod._extract, "build_row", fail_build_row)

    class StubTB:
        def sql(self, query):
            return [
                {
                    "sha256": file_hash,
                    "provider": "lambda",
                    "category": "compute",
                    "kind": "monthly_bill",
                    "period_month": "2026-06",
                    "amount": 0.0,
                    "currency": "USD",
                    "amount_usd": 0.0,
                    "credit_usd": 384.47,
                    "invoice_number": "old",
                    "issued_at": "2026-06-29",
                    "source": "email",
                    "file_ref": str(pdf),
                    "status": "parsed",
                    "ingested_at": "2026-07-01 00:00:00",
                }
            ]

        def append(self, datasource, rows):
            raise AssertionError("reparse_invoices must not append")

    stats = run_mod.reparse_invoices(
        {"archive_dir": str(archive), "fx_eur_usd": 1.14},
        StubTB(),
        "2026-07-03",
        dry_run=True,
    )

    assert stats["scanned"] == 1
    assert stats["known"] == 1
    assert stats["missing"] == 0
    assert stats["appended"] == 0
    assert capsys.readouterr().out == ""


def _stub_config():
    return {"fx_eur_usd": 1.14}
