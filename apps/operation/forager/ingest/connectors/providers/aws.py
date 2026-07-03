"""AWS Cost Explorer meter connector.

Two passes per run:
  1. Net-of-credits cost (filter excludes Credit+Refund RECORD_TYPEs) → funding=cash
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
        today:   retrieved_at date string "YYYY-MM-DD"
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts; cash rows + credit rows for nonzero months
    """
    if not months:
        return []

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

    # --- Pass 1: cash (net-of-credits, excludes Credit+Refund) ---
    cash_filter = json.dumps({
        "Not": {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Credit", "Refund"]}}
    })
    try:
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
                    cost_usd=amt,
                    funding="cash",
                    source="cli",
                    method="aws ce get-cost-and-usage (net-of-credits)",
                    today=today,
                ))
    except Exception:
        return []

    # --- Pass 2: credit (RECORD_TYPE=Credit, absolute value = grant burn) ---
    credit_filter = json.dumps({
        "Dimensions": {"Key": "RECORD_TYPE", "Values": ["Credit"]}
    })
    try:
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
                    cost_usd=amt,
                    funding="credit",
                    source="cli",
                    method="aws ce get-cost-and-usage (RECORD_TYPE=Credit)",
                    today=today,
                ))
    except Exception:
        pass

    return rows
