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

    rows = enty.build_transactions({"enty_ledger_dir": str(tmp_path)})

    assert rows == [
        {
            "date": "2026-05-28",
            "vendor": "alibaba",
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

    rows = enty.build_transactions({"enty_ledger_dir": str(tmp_path)})

    assert rows[0]["vendor"] == "vast.ai"
    assert rows[0]["charged_amount"] == 433.61
    assert rows[0]["charged_currency"] == "EUR"
    assert rows[0]["paid_amount"] == 500.0
    assert rows[0]["paid_currency"] == "USD"
    assert rows[0]["match_status"] == "matched"


def test_category_for_uses_vendor_default():
    assert enty.category_for("tinybird", "tinybird invoice 123", "") == "infra"
    assert enty.category_for("retell", "retell ai monthly plan", "") == "saas"
    assert enty.category_for("so-lab-x", "so lab x invoice", "") == "payroll"
    assert enty.category_for("denns-biomarkt", "denns biomarkt karlsruhe", "") == "office"


def test_category_for_keyword_rules_beat_default():
    subscription = "card transaction of 180.00 eur issued by claude.ai subscription anthropic.com"
    api = "card transaction of usd issued by anthropic anthropiccom"
    assert enty.category_for("anthropic", subscription, "") == "saas"
    assert enty.category_for("anthropic", api, "") == "compute"
    assert enty.category_for("anthropic", "claudeai subscription anthropiccom", "") == "saas"
    assert enty.category_for("openai", "openai chatgpt subscription", "") == "saas"
    assert enty.category_for("openai", "openai api usage", "") == "compute"
    # Wise mislabels Amazon retail card charges as counterparty "Amazon Web
    # Services EMEA SARL"; the note's "Amazon*" descriptor only appears on retail.
    retail = "amazon web services emea sarl card transaction issued by amazon* zee luxembourg"
    assert enty.category_for("aws", retail, "") == "office"
    assert enty.category_for("aws", "aws emea sarl monthly invoice", "") == "compute"


def test_category_for_vendorless_falls_back_to_enty_tag_then_other():
    assert enty.category_for("", "some grocery store", "Office") == "office"
    assert enty.category_for("", "unknown vendor", "Employee salaries") == "payroll"
    assert enty.category_for("", "unknown vendor", "Uncategorized expenses") == "other"
    assert enty.category_for("", "unknown vendor", "") == "other"


def test_amazon_retail_and_aws_stay_separate_vendors():
    assert enty.vendor_for("amazon web services emea sarl") == "aws"
    assert enty.vendor_for("amazon marketplace berlin") == "amazon"
    assert enty.category_for("amazon", "amazon marketplace berlin", "") == "office"
