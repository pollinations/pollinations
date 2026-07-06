"""AWS Cost Explorer meter connector.

Two passes per run:
  1. Gross usage before credits (filter excludes Credit+Refund RECORD_TYPEs) → funding=cash
     Note: this is gross usage BEFORE credits are applied, not net-of-credits.
     Consumers must derive net cash = max(meter_cash − credit_burn, 0).
     A parsed invoice always wins over the meter (phantom-cash incident in PoC cutover).
  2. Credit amounts only (filter RECORD_TYPE=Credit, absolute value) → funding=credit
     (quantifies the AWS grant burn)

Uses the default CLI profile (Myceli-direct root account, 301235909293).
CLI args ported verbatim from PoC build/connectors/accrual.py:aws_ce_monthly().
"""
import json
import subprocess

from . import _mrow


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fetch AWS metered cost per month via Cost Explorer CLI.

    Args:
        creds:   dict (unused — CLI uses ambient AWS profile/env)
        months:  list of "YYYY-MM" strings to include in output
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts; cash rows + credit rows for nonzero months
    """
    if not months:
        raise RuntimeError("AWS meter requires at least one month")

    # Derive start/end from months list
    months_sorted = sorted(months)
    start_month = months_sorted[0]
    start = f"{start_month}-01"
    # End is day after the last month
    end_year, end_mo = int(months_sorted[-1][:4]), int(months_sorted[-1][5:7])
    if end_mo == 12:
        end = f"{end_year + 1}-01-01"
    else:
        end = f"{end_year:04d}-{end_mo + 1:02d}-01"

    month_set = set(months)
    rows = []

    # --- Pass 1: gross usage before credits (excludes Credit+Refund RECORD_TYPEs) ---
    cash_filter = json.dumps({
        "Not": {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Credit", "Refund"]}}
    })
    r = run_cmd(
        ["aws", "ce", "get-cost-and-usage",
         "--time-period", f"Start={start},End={end}",
         "--granularity", "MONTHLY",
         "--metrics", "UnblendedCost",
         "--filter", cash_filter,
         "--output", "json"],
        capture_output=True, text=True, timeout=60,
    )
    d = json.loads(r.stdout)
    for row in d.get("ResultsByTime", []):
        month = row["TimePeriod"]["Start"][:7]
        if month not in month_set:
            continue
        amt = round(float(row["Total"]["UnblendedCost"]["Amount"]), 2)
        if amt:
            rows.append(_mrow(
                month=month,
                provider="aws",
                amount=amt,
                funding="cash",
                source="cli",
                today=today,
            ))

    # --- Pass 2: credit (RECORD_TYPE=Credit, absolute value = grant burn) ---
    credit_filter = json.dumps({
        "Dimensions": {"Key": "RECORD_TYPE", "Values": ["Credit"]}
    })
    r2 = run_cmd(
        ["aws", "ce", "get-cost-and-usage",
         "--time-period", f"Start={start},End={end}",
         "--granularity", "MONTHLY",
         "--metrics", "UnblendedCost",
         "--filter", credit_filter,
         "--output", "json"],
        capture_output=True, text=True, timeout=60,
    )
    d2 = json.loads(r2.stdout)
    for row in d2.get("ResultsByTime", []):
        month = row["TimePeriod"]["Start"][:7]
        if month not in month_set:
            continue
        amt = round(abs(float(row["Total"]["UnblendedCost"]["Amount"])), 2)
        if amt:
            rows.append(_mrow(
                month=month,
                provider="aws",
                amount=amt,
                funding="credit",
                source="cli",
                today=today,
            ))

    return rows
