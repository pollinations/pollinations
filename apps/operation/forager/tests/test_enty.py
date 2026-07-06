import csv
import os
import sys


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import enty


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_enty_exports_build_minimal_transactions(tmp_path):
    export = tmp_path / "archive_00361d51-39b3-4707-b981-4445e8f9cd99 (1)"
    docs = export / "archive_00361d51-39b3-4707-b981-4445e8f9cd99"
    docs.mkdir(parents=True)

    write_csv(
        export / "bank.csv",
        [
            "ID",
            "Date",
            "Bank name",
            "Counterparty Name",
            "Note",
            "Transaction type",
            "Category",
            "Mode",
            "Currency",
            "Amount",
            "Source Currency",
            "Source Amount",
            "Exchange Rate",
            "Status",
            "Comment",
        ],
        [
            {
                "ID": "1",
                "Date": "2026-5-28",
                "Bank name": "Wise",
                "Counterparty Name": "Alibaba",
                "Note": "Card transaction of 1,000.04 USD issued by Ant*Alibaba Cloud",
                "Transaction type": "outcoming",
                "Category": "Compute",
                "Mode": "normal",
                "Currency": "USD",
                "Amount": "-1000.04",
                "Source Currency": "",
                "Source Amount": "",
                "Exchange Rate": "",
                "Status": "PROCESSED",
                "Comment": "",
            },
            {
                "ID": "2",
                "Date": "2026-5-30",
                "Bank name": "Wise",
                "Counterparty Name": "Wise",
                "Note": "Wise fee",
                "Transaction type": "outcoming",
                "Category": "Banking",
                "Mode": "fee",
                "Currency": "EUR",
                "Amount": "-1",
                "Source Currency": "",
                "Source Amount": "",
                "Exchange Rate": "",
                "Status": "PROCESSED",
                "Comment": "",
            },
        ],
    )
    write_csv(
        export / "documents.csv",
        [
            "File name",
            "Number",
            "Issue date",
            "Due date",
            "Counterparty name",
            "Counterparty IBAN",
            "Currency",
            "Amount",
            "Transaction type",
        ],
        [
            {
                "File name": "EEAR1-2605000005128.pdf",
                "Number": "EEAR1-2605000005128",
                "Issue date": "2026-5-28",
                "Due date": "2026-5-28",
                "Counterparty name": "Myceli.AI OÜ",
                "Counterparty IBAN": "",
                "Currency": "USD",
                "Amount": "1000.04",
                "Transaction type": "outcoming",
            }
        ],
    )
    write_csv(
        docs / "transfers.csv",
        ["Type", "ID", "Created", "Amount", "Currency"],
        [{"Type": "Charge", "ID": "ch_1", "Created": "2026-5-28", "Amount": "10", "Currency": "usd"}],
    )

    rows = enty.build_transactions(
        {"enty_ledger_dir": str(tmp_path), "enty_ai_verify": False},
        creds={},
    )

    assert rows == [
        {
            "date": "2026-05-28",
            "provider": "alibaba",
            "category": "compute",
            "charged_amount": 1000.04,
            "charged_currency": "USD",
            "paid_amount": 1000.04,
            "paid_currency": "USD",
            "invoice_ref": "EEAR1-2605000005128.pdf",
            "match_status": "matched",
        }
    ]


def test_enty_source_amount_matches_invoice_currency(tmp_path):
    export = tmp_path / "archive_00361d51-39b3-4707-b981-4445e8f9cd99 (2)"
    export.mkdir()
    write_csv(
        export / "bank.csv",
        [
            "ID",
            "Date",
            "Bank name",
            "Counterparty Name",
            "Note",
            "Transaction type",
            "Category",
            "Mode",
            "Currency",
            "Amount",
            "Source Currency",
            "Source Amount",
            "Exchange Rate",
            "Status",
            "Comment",
        ],
        [
            {
                "ID": "1",
                "Date": "2026-3-31",
                "Bank name": "Wise",
                "Counterparty Name": "",
                "Note": "Card transaction of 500.00 USD issued by Vast.ai",
                "Transaction type": "outcoming",
                "Category": "Compute",
                "Mode": "normal",
                "Currency": "EUR",
                "Amount": "-433.61",
                "Source Currency": "",
                "Source Amount": "-499.995691",
                "Exchange Rate": "1.1531",
                "Status": "PROCESSED",
                "Comment": "",
            }
        ],
    )
    write_csv(
        export / "documents.csv",
        [
            "File name",
            "Number",
            "Issue date",
            "Due date",
            "Counterparty name",
            "Counterparty IBAN",
            "Currency",
            "Amount",
            "Transaction type",
        ],
        [
            {
                "File name": "VastAI - Invoice #396700-2643903.pdf",
                "Number": "396700-2643903",
                "Issue date": "2026-3-31",
                "Due date": "2026-3-31",
                "Counterparty name": "Myceli.AI OÜ",
                "Counterparty IBAN": "",
                "Currency": "USD",
                "Amount": "500",
                "Transaction type": "outcoming",
            }
        ],
    )

    rows = enty.build_transactions(
        {"enty_ledger_dir": str(tmp_path), "enty_ai_verify": False},
        creds={},
    )

    assert rows[0]["provider"] == "vast.ai"
    assert rows[0]["charged_amount"] == 433.61
    assert rows[0]["charged_currency"] == "EUR"
    assert rows[0]["paid_amount"] == 500.0
    assert rows[0]["paid_currency"] == "USD"
    assert rows[0]["match_status"] == "matched"


def test_enty_applies_transaction_overrides(tmp_path):
    export = tmp_path / "archive_00361d51-39b3-4707-b981-4445e8f9cd99 (3)"
    export.mkdir()
    write_csv(
        export / "bank.csv",
        [
            "ID",
            "Date",
            "Bank name",
            "Counterparty Name",
            "Note",
            "Transaction type",
            "Category",
            "Mode",
            "Currency",
            "Amount",
            "Source Currency",
            "Source Amount",
            "Exchange Rate",
            "Status",
            "Comment",
        ],
        [
            {
                "ID": "1",
                "Date": "2026-5-28",
                "Bank name": "Wise",
                "Counterparty Name": "Alibaba",
                "Note": "Card transaction issued by Ant*Alibaba Cloud",
                "Transaction type": "outcoming",
                "Category": "Compute",
                "Mode": "normal",
                "Currency": "USD",
                "Amount": "-1000.04",
                "Source Currency": "",
                "Source Amount": "",
                "Exchange Rate": "",
                "Status": "PROCESSED",
                "Comment": "",
            }
        ],
    )

    key = "|".join(
        [
            "2026-05-28",
            "1000.04",
            "USD",
            "0.0",
            "",
            "",
            "missing_invoice",
        ]
    )
    rows = enty.build_transactions(
        {
            "enty_ledger_dir": str(tmp_path),
            "enty_ai_verify": False,
            "overrides": {
                ("transactions", key, "provider"): "aws",
                ("transactions", key, "category"): "infra",
            },
        },
        creds={},
    )

    assert rows == [
        {
            "date": "2026-05-28",
            "provider": "aws",
            "category": "infra",
            "charged_amount": 1000.04,
            "charged_currency": "USD",
            "paid_amount": 0.0,
            "paid_currency": "",
            "invoice_ref": "",
            "match_status": "missing_invoice",
        }
    ]


def test_anthropic_subscription_is_saas_even_when_enty_says_compute():
    bank = {
        "counterparty": "Anthropic",
        "note": "Card transaction issued by Claude.ai Subscription ANTHROPIC.COM",
        "enty_category": "Compute",
    }
    invoice = {
        "file_name": "Invoice-G7HR5DQW-0004.pdf",
        "number": "G7HR5DQW-0004",
        "counterparty": "Anthropic, PBC",
        "text": "Description Max plan - 20x May 4-Jun 4, 2026",
    }

    assert enty.category_for(bank, "anthropic", invoice) == "saas"


def test_anthropic_credit_purchase_stays_compute():
    bank = {
        "counterparty": "Anthropic",
        "note": "Card transaction issued by Anthropic ANTHROPIC.COM",
        "enty_category": "Uncategorized Expenses",
    }
    invoice = {
        "file_name": "Invoice-PYGJUAYU-0037.pdf",
        "number": "PYGJUAYU-0037",
        "counterparty": "Anthropic, PBC",
        "text": "Description One-time credit purchase",
    }

    assert enty.category_for(bank, "anthropic", invoice) == "compute"


def test_ai_can_correct_non_empty_category_when_evidence_contradicts_it():
    rows = [{"provider": "anthropic", "category": "compute"}]

    enty.apply_corrections(rows, [{"index": 0, "category": "saas"}])

    assert rows == [{"provider": "anthropic", "category": "saas"}]
