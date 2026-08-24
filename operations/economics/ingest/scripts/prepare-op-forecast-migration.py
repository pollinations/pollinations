#!/usr/bin/env python3

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path


ANCHOR_DATE = "2026-01-01"
METHOD_RE = re.compile(r"(?:^|[;\s])method=(fixed|funded|last|scheduled|zero)(?=$|[;\s])", re.I)
TRANSACTION_FIELDS = [
    "entry_id",
    "kind",
    "source",
    "date",
    "vendor",
    "category",
    "amount",
    "currency",
    "description",
    "evidence",
    "recorded_at",
]
FORECAST_FIELDS = [
    "entry_id",
    "month",
    "vendor",
    "category",
    "amount",
    "currency",
    "method",
    "source",
    "evidence",
    "recorded_at",
]


def arguments():
    parser = argparse.ArgumentParser(
        description="Prepare the reviewed OP Forecast and bank-ledger migration without publishing."
    )
    parser.add_argument("--transactions-json", type=Path, required=True)
    parser.add_argument("--runway-json", type=Path, required=True)
    parser.add_argument("--statement-dir", type=Path, required=True)
    parser.add_argument("--recorded-at", required=True)
    parser.add_argument("--transactions-output", type=Path, required=True)
    parser.add_argument("--forecast-output", type=Path, required=True)
    return parser.parse_args()


def read_snapshot(path):
    payload = json.loads(path.read_text())
    rows = payload.get("data")
    if not isinstance(rows, list):
        raise RuntimeError(f"{path.name} must contain a data array")
    return rows


def parse_statement_date(value):
    return datetime.strptime(value, "%d-%m-%Y").date().isoformat()


def parse_number(value):
    return float(str(value).replace(",", "").strip())


def normalized_statement_id(value):
    entry_id = str(value or "").strip()
    if entry_id.startswith("CARD-"):
        return "CARD_TRANSACTION-" + entry_id.removeprefix("CARD-")
    if entry_id.startswith("DIRECT_DEBIT-"):
        return "DIRECT_DEBIT_TRANSACTION-" + entry_id.removeprefix(
            "DIRECT_DEBIT-"
        )
    return entry_id


def parent_statement_id(entry_id):
    matched = re.match(
        r"^((?:TRANSFER|CARD_TRANSACTION|DIRECT_DEBIT_TRANSACTION)-\d+)"
        r"(?:-(?:\d+|EUR|USD|GBP|CAD))?$",
        str(entry_id),
    )
    return matched.group(1) if matched else str(entry_id)


def read_statements(directory):
    rows = []
    for path in sorted(directory.glob("*.csv")):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                if row.get("Date"):
                    rows.append(row)
    if not rows:
        raise RuntimeError("No Wise statement rows found")
    return rows


def statement_dates(rows):
    dates = {}
    for row in rows:
        entry_id = normalized_statement_id(row.get("TransferWise ID"))
        if not entry_id or entry_id.startswith("FEE-"):
            continue
        dates.setdefault(entry_id, set()).add(parse_statement_date(row["Date"]))
    ambiguous = {entry_id for entry_id, values in dates.items() if len(values) > 1}
    return (
        {
            entry_id: next(iter(values))
            for entry_id, values in dates.items()
            if entry_id not in ambiguous
        },
        ambiguous,
    )


def opening_balances(rows):
    by_currency = {}
    for row in rows:
        date = parse_statement_date(row["Date"])
        if date >= ANCHOR_DATE:
            continue
        currency = str(row.get("Currency", "")).strip()
        if not currency:
            continue
        current = by_currency.get(currency)
        timestamp = datetime.strptime(row["Date Time"], "%d-%m-%Y %H:%M:%S.%f")
        balance = parse_number(row["Running Balance"])
        if (
            current is not None
            and timestamp == current[0]
            and abs(balance - current[1]) > 0.000000001
        ):
            raise RuntimeError(
                f"Conflicting {currency} running balances at {row['Date Time']}"
            )
        if current is None or timestamp > current[0]:
            by_currency[currency] = (timestamp, balance)
    return {
        currency: balance
        for currency, (_, balance) in by_currency.items()
        if abs(balance) > 0.000000001
    }


def clean_legacy_evidence(value):
    parts = [
        part.strip()
        for part in str(value or "").split(";")
        if part.strip() and not part.strip().lower().startswith("method=")
    ]
    return "; ".join(parts)


def forecast_method(row):
    matched = METHOD_RE.search(str(row.get("evidence", "")))
    if not matched:
        raise RuntimeError(f"Forecast {row['entry_id']} has no legacy method")
    method = matched.group(1).lower()
    if method == "scheduled":
        return "one_off"
    return method


def selected(row, fields):
    return {field: row.get(field, "") for field in fields}


def write_ndjson(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in rows)
    )


def main():
    args = arguments()
    datetime.strptime(args.recorded_at, "%Y-%m-%d %H:%M:%S.%f")
    statement_rows = read_statements(args.statement_dir.resolve())
    settlement_dates, ambiguous_statement_ids = statement_dates(statement_rows)

    transactions = []
    corrected_dates = 0
    matched_statement_rows = 0
    for source in read_snapshot(args.transactions_json.resolve()):
        row = dict(source)
        row["kind"] = "transaction"
        row["recorded_at"] = args.recorded_at
        parent_id = parent_statement_id(row["entry_id"])
        if parent_id in ambiguous_statement_ids:
            raise RuntimeError(
                "A retained bank row has an ambiguous reversal settlement date"
            )
        settlement_date = settlement_dates.get(parent_id)
        if settlement_date:
            matched_statement_rows += 1
            if row["date"] != settlement_date:
                row["date"] = settlement_date
                corrected_dates += 1
        transactions.append(selected(row, TRANSACTION_FIELDS))

    balances = opening_balances(statement_rows)
    for currency, amount in sorted(balances.items()):
        transactions.append(
            {
                "entry_id": f"wise-opening-balance-{ANCHOR_DATE}-{currency.lower()}",
                "kind": "opening_balance",
                "source": "wise",
                "date": ANCHOR_DATE,
                "vendor": "wise",
                "category": "balance_sheet",
                "amount": amount,
                "currency": currency,
                "description": f"Opening bank balance at {ANCHOR_DATE}",
                "evidence": "Wise statement running balance immediately before the opening date",
                "recorded_at": args.recorded_at,
            }
        )

    old_runway = read_snapshot(args.runway_json.resolve())
    forecast = []
    dropped_zero_rows = 0
    dropped_non_forecast_rows = 0
    for source in old_runway:
        if source.get("kind") != "forecast":
            dropped_non_forecast_rows += 1
            continue
        amount = float(source.get("amount", 0))
        method = forecast_method(source)
        if abs(amount) <= 0.000000001 and method != "funded":
            dropped_zero_rows += 1
            continue
        row = {
            "entry_id": source["entry_id"],
            "month": source["date"],
            "vendor": source["vendor"],
            "category": source["category"],
            "amount": amount,
            "currency": source["currency"],
            "method": method,
            "source": source["source"],
            "evidence": clean_legacy_evidence(source.get("evidence")),
            "recorded_at": args.recorded_at,
        }
        forecast.append(selected(row, FORECAST_FIELDS))

    transactions.sort(key=lambda row: (row["date"], row["kind"], row["entry_id"]))
    forecast.sort(key=lambda row: (row["month"], row["vendor"], row["entry_id"]))
    write_ndjson(args.transactions_output.resolve(), transactions)
    write_ndjson(args.forecast_output.resolve(), forecast)
    print(
        json.dumps(
            {
                "transaction_rows": len(transactions),
                "movement_rows": len(transactions) - len(balances),
                "opening_balance_currencies": sorted(balances),
                "statement_matched_movements": matched_statement_rows,
                "settlement_dates_corrected": corrected_dates,
                "forecast_rows": len(forecast),
                "legacy_zero_rows_dropped": dropped_zero_rows,
                "legacy_non_forecast_rows_dropped": dropped_non_forecast_rows,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
