"""Enty export ingestion for the Treasury transactions table."""

import csv
import json
import os
import subprocess
import urllib.request
from pathlib import Path

from .aliases import PROVIDER_ALIASES


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
    rows = verify_provider_categories(rows, config, creds or {})
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
        "category": category_for(bank, provider, invoice),
        "charged_amount": money_amount(bank["amount"]),
        "charged_currency": currency_code(bank["currency"], bank["amount"]),
        "paid_amount": money_amount(invoice["amount"]),
        "paid_currency": currency_code(invoice["currency"], invoice["amount"]),
        "invoice_ref": invoice["file_name"],
        "match_status": "matched",
        "_evidence": evidence(bank, invoice),
    }


def missing_invoice(bank):
    provider = provider_for(bank_text(bank))
    return {
        "date": bank["date"],
        "provider": provider,
        "category": category_for(bank, provider),
        "charged_amount": money_amount(bank["amount"]),
        "charged_currency": currency_code(bank["currency"], bank["amount"]),
        "paid_amount": 0.0,
        "paid_currency": "",
        "invoice_ref": "",
        "match_status": "missing_invoice",
        "_evidence": evidence(bank, None),
    }


def missing_payment(invoice):
    provider = provider_for(invoice_text(invoice))
    return {
        "date": invoice["date"],
        "provider": provider,
        "category": category_for({}, provider, invoice),
        "charged_amount": 0.0,
        "charged_currency": "",
        "paid_amount": money_amount(invoice["amount"]),
        "paid_currency": currency_code(invoice["currency"], invoice["amount"]),
        "invoice_ref": invoice["file_name"],
        "match_status": "missing_payment",
        "_evidence": evidence(None, invoice),
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


def category_for(bank, provider, invoice=None):
    mapped = CATEGORY_MAP.get(str(bank.get("enty_category", "")).lower(), "")
    if mapped and mapped != "other":
        return mapped
    if provider == "deel":
        return "payroll"
    if provider in {"github", "notion", "slack", "discord", "canva", "buffer", "protonvpn"}:
        return "saas"
    if provider in {"tele2", "naturenergie", "gaswerksiedlung"}:
        return "office"
    if provider in {"tinybird", "cloudflare", "digitalocean", "vercel", "protonvpn"}:
        return "infra"
    if provider in {"enty", "wise", "stripe", "polar"}:
        return "admin"
    if provider:
        return "compute"
    return "other"


def verify_provider_categories(rows, config, creds):
    if not config.get("enty_ai_verify", True):
        return rows

    endpoint = config["enty_ai_endpoint"]
    key = agent_key(endpoint, creds)
    if not key:
        raise RuntimeError("OpenAI key missing for Enty provider/category verification")

    out = [dict(row) for row in rows]
    batch_size = int(config["enty_ai_batch_size"])
    for offset in range(0, len(out), batch_size):
        batch = out[offset : offset + batch_size]
        corrections = verify_provider_category_batch(batch, offset, config, endpoint, key)
        apply_corrections(out, corrections)
    return out


def verify_provider_category_batch(rows, offset, config, endpoint, key):
    payload = {
        "model": config["enty_ai_model"],
        "temperature": 0,
        "max_tokens": int(config["enty_ai_max_tokens"]),
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Verify Treasury transaction provider/category values. "
                    "Return JSON with key corrections: an array of objects "
                    "{index, provider, category}. Only include rows that need changes. "
                    f"Allowed providers: {sorted(PROVIDER_ALIASES)}. "
                    f"Allowed categories: {sorted(ALLOWED_CATEGORIES)}. "
                    "Use _evidence to classify the row, but never return _evidence. "
                    "Provider identity is not category; the same provider can have "
                    "different categories in different invoices. Classify category from "
                    "the bank description plus invoice product/line-item text. "
                    "Compute means raw API usage, metered inference, or provider credits. "
                    "SaaS means subscriptions, plans, seats, and human app access. "
                    "Payroll means salaries, contractors, or payroll service payments. "
                    "Office means rent, utilities, groceries, supplies, and workplace "
                    "operating costs. "
                    "Examples: Denns Biomarkt supermarket food is office; Windsurf, "
                    "Retell, and fixed monthly Anthropic subscriptions are saas; "
                    "SO LAB X and THOT contractor/payroll invoices are payroll; "
                    "Anthropic API credits or metered usage are compute. "
                    "For Anthropic, Claude.ai Subscription, Claude/Cloud Max Monthly, "
                    "or Max plan line items are saas. Anthropic one-time credit purchase "
                    "or API usage is compute. "
                    "Prefer the existing provider when it is non-empty. Prefer the "
                    "existing category only when evidence does not clearly contradict it. "
                    "Correct blanks, unknowns, or clearly wrong values only. "
                    "Never return a category outside the allowed categories. "
                    "Never use provider names such as community as categories. "
                    "Do not change amounts, dates, invoice refs, or match_status."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "index_offset": offset,
                        "rows": [
                            {"index": offset + i, **row}
                            for i, row in enumerate(rows)
                        ],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    response = post_chat(
        endpoint,
        payload,
        key,
        timeout=int(config["enty_ai_timeout"]),
    )
    return parse_agent_corrections(response)


def apply_corrections(out, corrections):
    for correction in corrections:
        index = correction.get("index")
        provider = correction.get("provider")
        category = correction.get("category")
        if not isinstance(index, int) or index < 0 or index >= len(out):
            raise RuntimeError(f"Enty AI returned invalid row index: {index}")
        if provider is None:
            provider = out[index]["provider"]
        if category is None or category == "":
            category = out[index]["category"]
        if out[index]["provider"] and provider != out[index]["provider"]:
            provider = out[index]["provider"]
        if provider not in PROVIDER_ALIASES and provider != "":
            raise RuntimeError(f"Enty AI returned unknown provider: {provider}")
        if category not in ALLOWED_CATEGORIES:
            raise RuntimeError(f"Enty AI returned unknown category: {category}")
        out[index]["provider"] = provider
        out[index]["category"] = category


def strip_private_fields(rows):
    return [{column: row.get(column, "") for column in COLUMNS} for row in rows]


def agent_key(endpoint, creds):
    if "api.openai.com" in endpoint:
        return creds.get("OPENAI_ADMIN_KEY") or creds.get("OPENAI_API_KEY")
    if "openrouter.ai" in endpoint:
        return creds.get("OPENROUTER_API_KEY")
    return creds.get("POLLINATIONS_KEY")


def post_chat(endpoint, payload, key, timeout=180):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://pollinations.ai",
            "X-Title": "Forager Enty Transactions",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def parse_agent_corrections(response):
    content = response["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    if "corrections" not in parsed:
        raise RuntimeError("Enty AI response missing corrections array")
    corrections = parsed["corrections"]
    if not isinstance(corrections, list):
        raise RuntimeError("Enty AI response corrections must be an array")
    return corrections


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


def evidence(bank, invoice):
    parts = []
    if bank:
        parts.append(
            "bank: "
            + " | ".join(
                value
                for value in [
                    bank.get("counterparty", ""),
                    bank.get("note", ""),
                    bank.get("enty_category", ""),
                    money(bank.get("amount"), bank.get("currency")),
                    money(bank.get("source_amount"), bank.get("source_currency")),
                ]
                if value
            )
        )
    if invoice:
        parts.append(
            "invoice: "
            + " | ".join(
                value
                for value in [
                    invoice.get("file_name", ""),
                    invoice.get("number", ""),
                    invoice.get("counterparty", ""),
                    money(invoice.get("amount"), invoice.get("currency")),
                    invoice.get("text", ""),
                ]
                if value
            )
        )
    return " ; ".join(parts)


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


def money(value, currency):
    if not value:
        return ""
    symbol = {"EUR": "€", "USD": "$", "GBP": "£"}.get(currency.upper(), currency.upper())
    return f"{symbol}{value:,.2f}" if len(symbol) == 1 else f"{value:,.2f} {symbol}".strip()


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
