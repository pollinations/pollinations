"""Collect a closed UTC Stripe Tax month. Use --write to append to staging."""

import argparse
import csv
import datetime as dt
import io
import json
import os
import time
from collections import defaultdict
from decimal import Decimal
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

STRIPE = "https://api.stripe.com/v1/"
TINYBIRD = "https://api.europe-west2.gcp.tinybird.co"
REPORT_TYPE = "tax.transactions.itemized.2"
ACCOUNTS = {
    "pollen": ("acct_1SrY3q7rcjS3l7tr", "STRIPE_API_KEY"),
    "kofi": ("acct_1QzdqWGHtmCJlpeq", "STRIPE_KOFI_API_KEY"),
}


def request(url, token, data=None, content_type="application/x-www-form-urlencoded"):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": content_type}
    with urlopen(Request(url, data=data, headers=headers), timeout=30) as response:
        return response.read()


def report_rows(token, account_id, month, report_id):
    start = dt.datetime.fromisoformat(f"{month}-01").replace(tzinfo=dt.UTC)
    end = (start + dt.timedelta(days=32)).replace(day=1)
    if end > dt.datetime.now(dt.UTC):
        raise ValueError("The calendar month must be closed")

    account = json.loads(request(STRIPE + "account", token))
    if account["id"] != account_id:
        raise ValueError("Wrong Stripe account")
    params = {
        "interval_start": int(start.timestamp()),
        "interval_end": int(end.timestamp()),
        "timezone": "UTC",
    }
    if report_id is None:
        fields = {"report_type": REPORT_TYPE}
        fields.update({f"parameters[{key}]": value for key, value in params.items()})
        fields["parameters[columns][]"] = ["transaction_date", "currency", "tax_amount"]
        report = json.loads(request(STRIPE + "reporting/report_runs", token,
                                    urlencode(fields, doseq=True).encode()))
        report_id = report["id"]

    if not report_id.startswith("frr_") or not report_id[4:].isalnum():
        raise ValueError("Invalid Stripe report ID")
    for _ in range(25):
        report = json.loads(request(STRIPE + "reporting/report_runs/" + report_id, token))
        if report["status"] != "pending":
            break
        time.sleep(3)
    if (report["status"] != "succeeded" or not report["livemode"]
            or report["report_type"] != REPORT_TYPE
            or any(report["parameters"].get(key) != value for key, value in params.items())):
        raise ValueError("Stripe report is not a completed, matching UTC tax export")

    url = report["result"]["url"]
    if urlsplit(url).netloc != "files.stripe.com" or urlsplit(url).scheme != "https":
        raise ValueError("Unexpected Stripe report file host")
    totals = defaultdict(int)
    records = csv.DictReader(io.StringIO(request(url, token).decode("utf-8-sig")))
    if not {"transaction_date", "currency", "tax_amount"}.issubset(records.fieldnames or []):
        raise ValueError("Unexpected Stripe report columns")
    for row in records:
        date = dt.datetime.fromisoformat(row["transaction_date"]).replace(tzinfo=dt.UTC)
        minor = Decimal(row["tax_amount"]) * 100
        currency = row["currency"].upper()
        if not start <= date < end or currency not in {"EUR", "USD"}:
            raise ValueError("Stripe report has an out-of-period or unsupported row")
        if not minor.is_finite() or minor != minor.to_integral_value():
            raise ValueError("Invalid Stripe tax amount")
        totals[currency] += int(minor)
    # The complete report also verifies zero tax for a supported currency absent from it.
    recorded_at = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return [
        dict(account_id=account_id, month=month, currency=currency,
             tax_minor=totals[currency], report_id=report_id, recorded_at=recorded_at)
        for currency in ("EUR", "USD")
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stream", choices=ACCOUNTS)
    parser.add_argument("month", help="Closed month in YYYY-MM format")
    parser.add_argument("--report-id", help="Reuse a matching completed Stripe report")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    account_id, key = ACCOUNTS[args.stream]
    rows = report_rows(os.environ[key], account_id, args.month, args.report_id)
    payload = "".join(json.dumps(row) + "\n" for row in rows)
    if args.write:
        token = os.environ["TINYBIRD_OPS_INGEST_TOKEN"]
        workspace = json.loads(request(TINYBIRD + "/v1/workspace", token))
        if workspace["name"] != "pollinations_enter_staging":
            raise ValueError("This collector only writes staging")
        result = json.loads(request(
            TINYBIRD + "/v0/events?name=economics_stripe_customer_tax&wait=true",
            token, payload.encode(), "application/x-ndjson",
        ))
        if result["successful_rows"] != len(rows) or result["quarantined_rows"] != 0:
            raise RuntimeError("Tinybird did not accept the complete tax report")
    print(payload, end="")


if __name__ == "__main__":
    main()
