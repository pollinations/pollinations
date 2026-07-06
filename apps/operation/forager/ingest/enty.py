"""Enty export ingestion for the Treasury transactions table."""

import csv
import os
import subprocess
from pathlib import Path

from .aliases import PROVIDER_ALIASES, PROVIDER_CATEGORIES, PROVIDER_CATEGORY_RULES


COLUMNS = [
    "date",
    "provider",
    "category",
    "charged_amount",
    "charged_currency",
    "paid_amount",
    "paid_currency",
    "invoice_ref",
    "match_status",
]

ALLOWED_CATEGORIES = {
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
}

CATEGORY_MAP = {
    "banking": "admin",
    "compute": "compute",
    "employee salaries": "payroll",
    "office": "office",
    "productivity": "saas",
    "uncategorized expenses": "other",
}

def build_transactions(config, creds=None):
    root = Path(os.path.expanduser(config["enty_ledger_dir"]))
    rows = []
    for group in read_export_groups(root):
        rows.extend(transactions_for_group(group))
    rows = strip_private_fields(rows)
    validate_rows(rows)
    return rows


def read_export_groups(root):
    groups = []
    for directory in sorted(path for path in root.iterdir() if path.is_dir()):
        group = {"dir": str(directory), "bank": [], "invoices": []}
        for path in sorted(directory.rglob("*.csv")):
            rows = read_csv(path)
            if not rows:
                continue
            header = set(rows[0])
            if {"ID", "Date", "Counterparty Name", "Amount"}.issubset(header):
                group["bank"].extend(
                    row for row in (parse_bank(row) for row in rows) if row
                )
            elif {"File name", "Issue date", "Currency", "Amount"}.issubset(header):
                group["invoices"].extend(
                    row for row in (parse_invoice(row, directory) for row in rows) if row
                )
        if group["bank"] or group["invoices"]:
            groups.append(group)
    return groups


def read_csv(path):
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def parse_bank(row):
    if value(row, "Transaction type") != "outcoming":
        return None
    if value(row, "Mode") == "fee":
        return None
    return {
        "date": date(value(row, "Date")),
        "counterparty": value(row, "Counterparty Name"),
        "note": value(row, "Note"),
        "enty_category": value(row, "Category"),
        "amount": amount(value(row, "Amount")),
        "currency": value(row, "Currency"),
        "source_amount": amount(value(row, "Source Amount")),
        "source_currency": value(row, "Source Currency") or note_currency(value(row, "Note")),
    }


def parse_invoice(row, root):
    if value(row, "Transaction type") != "outcoming":
        return None
    file_name = value(row, "File name")
    return {
        "date": date(value(row, "Issue date")),
        "file_name": file_name,
        "number": value(row, "Number"),
        "counterparty": value(row, "Counterparty name"),
        "amount": amount(value(row, "Amount")),
        "currency": value(row, "Currency"),
        "text": invoice_file_text(root, file_name),
    }


def invoice_file_text(root, file_name):
    if not file_name.lower().endswith(".pdf"):
        return ""

    matches = sorted(Path(root).rglob(file_name))
    if not matches:
        return ""

    try:
        result = subprocess.run(
            ["pdftotext", str(matches[0]), "-"],
            capture_output=True,
            text=True,
            timeout=20,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pdftotext is required to read invoice product text") from exc

    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed for invoice {file_name}")

    return " ".join(result.stdout.split())[:2000]


def transactions_for_group(group):
    invoices = group["invoices"]
    used_invoices = set()
    out = []

    for bank in group["bank"]:
        invoice_index = find_invoice(bank, invoices, used_invoices)
        if invoice_index is None:
            out.append(missing_invoice(bank))
            continue
        used_invoices.add(invoice_index)
        out.append(matched(bank, invoices[invoice_index]))

    for index, invoice in enumerate(invoices):
        if index not in used_invoices:
            out.append(missing_payment(invoice))

    return out


def find_invoice(bank, invoices, used):
    for index, invoice in enumerate(invoices):
        if index in used:
            continue
        if same_money(bank["amount"], bank["currency"], invoice["amount"], invoice["currency"]):
            return index
        if same_money(
            bank["source_amount"],
            bank["source_currency"],
            invoice["amount"],
            invoice["currency"],
        ):
            return index
    return None


def matched(bank, invoice):
    provider = provider_for(f"{bank_text(bank)} {invoice_text(invoice)}")
    return {
        "date": bank["date"] or invoice["date"],
        "provider": provider,
        "category": category_for(
            provider,
            f"{bank_text(bank)} {invoice_text(invoice)}",
            bank.get("enty_category", ""),
        ),
        "charged_amount": money_amount(bank["amount"]),
        "charged_currency": currency_code(bank["currency"], bank["amount"]),
        "paid_amount": money_amount(invoice["amount"]),
        "paid_currency": currency_code(invoice["currency"], invoice["amount"]),
        "invoice_ref": invoice["file_name"],
        "match_status": "matched",
    }


def missing_invoice(bank):
    provider = provider_for(bank_text(bank))
    return {
        "date": bank["date"],
        "provider": provider,
        "category": category_for(provider, bank_text(bank), bank.get("enty_category", "")),
        "charged_amount": money_amount(bank["amount"]),
        "charged_currency": currency_code(bank["currency"], bank["amount"]),
        "paid_amount": 0.0,
        "paid_currency": "",
        "invoice_ref": "",
        "match_status": "missing_invoice",
    }


def missing_payment(invoice):
    provider = provider_for(invoice_text(invoice))
    return {
        "date": invoice["date"],
        "provider": provider,
        "category": category_for(provider, invoice_text(invoice), ""),
        "charged_amount": 0.0,
        "charged_currency": "",
        "paid_amount": money_amount(invoice["amount"]),
        "paid_currency": currency_code(invoice["currency"], invoice["amount"]),
        "invoice_ref": invoice["file_name"],
        "match_status": "missing_payment",
    }


def provider_for(text):
    low = text.lower()
    for provider, aliases in PROVIDER_ALIASES.items():
        if provider in {"other", "self-issued"}:
            continue
        values = set(aliases)
        values.add(provider)
        if any(alias and alias.lower() in low for alias in values):
            return provider
    return ""


def category_for(provider, text, enty_category):
    low = text.lower()
    for keyword, category in PROVIDER_CATEGORY_RULES.get(provider, []):
        if keyword in low:
            return category
    if provider:
        return PROVIDER_CATEGORIES[provider]
    mapped = CATEGORY_MAP.get(str(enty_category or "").lower(), "")
    return mapped or "other"


def strip_private_fields(rows):
    return [{column: row.get(column, "") for column in COLUMNS} for row in rows]


def validate_rows(rows):
    for row in rows:
        missing = [column for column in COLUMNS if column not in row]
        if missing:
            raise ValueError(f"transactions row missing columns: {missing}")
        if row["provider"] and row["provider"] not in PROVIDER_ALIASES:
            raise ValueError(f"unknown provider in transactions: {row['provider']}")
        if row["category"] not in ALLOWED_CATEGORIES:
            raise ValueError(f"unknown category in transactions: {row['category']}")
        if row["match_status"] not in {"matched", "missing_invoice", "missing_payment"}:
            raise ValueError(f"unknown match_status in transactions: {row['match_status']}")


def bank_text(row):
    return f"{row.get('counterparty', '')} {row.get('note', '')}"


def invoice_text(row):
    return (
        f"{row.get('file_name', '')} {row.get('number', '')} "
        f"{row.get('counterparty', '')} {row.get('text', '')}"
    )


def same_money(left_amount, left_currency, right_amount, right_currency):
    if not left_amount or not right_amount:
        return False
    if left_currency.upper() != right_currency.upper():
        return False
    return abs(float(left_amount) - float(right_amount)) <= 0.01


def note_currency(note):
    text = f" {note.upper()} "
    for currency in ("USD", "EUR", "GBP"):
        if f" {currency} " in text:
            return currency
    return ""


def money_amount(value):
    return round(float(value or 0), 2)


def currency_code(currency, value):
    if not value:
        return ""
    return str(currency or "").strip().upper()


def date(raw):
    parts = raw.split("-")
    if len(parts) != 3:
        return raw
    return f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"


def amount(raw):
    if not raw:
        return 0.0
    return abs(float(raw.replace(",", "")))


def value(row, key):
    return (row.get(key) or "").strip()
