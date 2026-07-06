"""Wise Activities ingestion for the Treasury transactions table.

Wise is the cash source of truth: one transactions row per outgoing bank
movement, classified against the vendor roster. The settled (EUR) leg is
what left the bank; invoice linking is a later, separate step.
"""

import base64
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse

from .aliases import (
    VENDOR_ALIASES,
    VENDOR_AMOUNT_RULES,
    VENDOR_CATEGORIES,
    VENDOR_CATEGORY_RULES,
)
from .connectors.common import http_json, strip_html


COLUMNS = [
    "date",
    "vendor",
    "category",
    "charged_amount",
    "charged_currency",
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

KEPT_STATUSES = {"COMPLETED", "IN_PROGRESS"}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def build_transactions(secrets, months):
    rows = []
    unmatched = []
    for month in months:
        for activity in fetch_month(secrets, month):
            row = transaction_for(activity)
            if row is None:
                continue
            rows.append(row)
            if not row["vendor"]:
                unmatched.append((row, activity_text(activity).strip()))
    flag = unmatched_flag(unmatched)
    if flag:
        print(flag)
    validate_rows(rows)
    return rows


def unmatched_flag(unmatched):
    """Agent-ready fix instructions for rows that matched no vendor."""
    if not unmatched:
        return ""
    by_text = {}
    for row, text in unmatched:
        entry = by_text.setdefault(text, {"n": 0, "example": row})
        entry["n"] += 1
    lines = [
        f"⚠ transactions: {len(unmatched)} rows have no vendor match.",
        "  Fix: for each counterparty below, add a lowercase substring of its",
        "  text as an alias in apps/operation/forager/config/vendor_aliases.json",
        '  (to an existing vendor, or a new {"aliases": [...], "category": ...}',
        "  entry), then re-run: python3 -m ingest.run --only transactions",
    ]
    for text, entry in sorted(by_text.items()):
        row = entry["example"]
        lines.append(
            f'    "{text}" — {entry["n"]} row(s), e.g. {row["date"]} '
            f'{row["charged_amount"]} {row["charged_currency"]}'
        )
    return "\n".join(lines)


def month_bounds(month):
    year, mon = [int(part) for part in month.split("-")]
    next_year, next_mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
    return (
        f"{month}-01T00:00:00.000Z",
        f"{next_year:04d}-{next_mon:02d}-01T00:00:00.000Z",
    )


def fetch_month(secrets, month):
    """All activities for `month`, following the pagination cursor.

    Wise returns `cursor` (null on the last page); it goes back as
    `nextCursor`.
    """
    token = secrets.get("WISE_API_TOKEN")
    profile = secrets.get("WISE_BUSINESS_PROFILE_ID")
    if not token or not profile:
        raise RuntimeError("WISE_API_TOKEN / WISE_BUSINESS_PROFILE_ID missing")
    since, until = month_bounds(month)
    base = (
        f"https://api.wise.com/v1/profiles/{profile}/activities"
        f"?size=100&since={since}&until={until}"
    )
    activities, cursor = [], None
    for _ in range(50):  # hard stop: 5,000 activities/month
        url = base + (
            f"&nextCursor={urllib.parse.quote(cursor, safe='')}" if cursor else ""
        )
        data = http_json(url, {"Authorization": f"Bearer {token}"})
        page = data.get("activities", []) or []
        activities.extend(page)
        cursor = data.get("cursor")
        if not cursor or not page:
            break
    else:
        raise RuntimeError(
            f"wise {month}: cursor still live after 50 pages — refusing a partial pull"
        )
    print(f"    wise {month}: {len(activities)} activities")
    return activities


def sign_sca(token, private_key_pem):
    """Base64 RSA-SHA256 signature of an SCA one-time token, via openssl."""
    fd, path = tempfile.mkstemp()
    try:
        os.write(fd, private_key_pem.encode())
        os.close(fd)
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", path],
            input=token.encode(),
            capture_output=True,
            timeout=20,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"openssl SCA signing failed: {result.stderr.decode()[:200]}"
            )
        return base64.b64encode(result.stdout).decode()
    finally:
        os.unlink(path)


def http_json_sca(url, secrets):
    """GET a Wise endpoint, answering an SCA challenge when one comes back.

    Wise rejects protected endpoints with 403 plus an `x-2fa-approval`
    one-time token; signing that token with the registered private key and
    retrying satisfies strong customer authentication.
    """
    headers = {"Authorization": f"Bearer {secrets['WISE_API_TOKEN']}"}
    try:
        return http_json(url, headers)
    except urllib.error.HTTPError as error:
        token = error.headers.get("x-2fa-approval")
        if error.code != 403 or not token:
            raise
        key = secrets.get("WISE_SCA_PRIVATE_KEY")
        if not key:
            raise RuntimeError(
                "WISE_SCA_PRIVATE_KEY missing — register a public key with "
                "Wise and store the private half in secrets/env.json"
            )
        signature = sign_sca(token, key)
        return http_json(
            url,
            {**headers, "x-2fa-approval": token, "X-Signature": signature},
        )


def fetch_balances(secrets):
    """All standard balances (id + currency) on the business profile."""
    profile = secrets.get("WISE_BUSINESS_PROFILE_ID")
    url = f"https://api.wise.com/v4/profiles/{profile}/balances?types=STANDARD"
    return http_json_sca(url, secrets)


def fetch_statement(secrets, balance_id, month):
    """One month of statement lines for one balance (SCA-protected)."""
    profile = secrets.get("WISE_BUSINESS_PROFILE_ID")
    since, until = month_bounds(month)
    url = (
        f"https://api.wise.com/v1/profiles/{profile}/balance-statements/"
        f"{balance_id}/statement.json"
        f"?intervalStart={since}&intervalEnd={until}&type=COMPACT"
    )
    return http_json_sca(url, secrets).get("transactions", [])


def transaction_for(activity):
    """A transactions row for one activity, or None for rows we skip.

    Kept: settled outgoing movements (COMPLETED or IN_PROGRESS). Skipped:
    inflows (revenue's witness is Stripe — Wise inflows would double-count
    payouts), card authorization checks, cancelled/declined activity.
    """
    if activity.get("status") not in KEPT_STATUSES:
        return None
    if activity.get("type") == "CARD_CHECK":
        return None
    if "positive" in (activity.get("primaryAmount") or ""):
        return None
    amount, currency = settled_amount(activity)
    if amount <= 0:
        return None
    text = activity_text(activity)
    vendor = vendor_for(text)
    charged = round(amount, 2)
    return {
        "date": (activity.get("createdOn") or "")[:10],
        "vendor": vendor,
        "category": category_for(vendor, text, charged),
        "charged_amount": charged,
        "charged_currency": currency,
    }


def settled_amount(activity):
    """The leg that left the bank: the EUR side when either leg is EUR,
    otherwise the primary amount as-is."""
    primary, primary_currency = parse_amount(activity.get("primaryAmount", ""))
    secondary, secondary_currency = parse_amount(activity.get("secondaryAmount", ""))
    if primary_currency == "EUR":
        return primary, primary_currency
    if secondary_currency == "EUR" and secondary:
        return secondary, secondary_currency
    return primary, primary_currency


def parse_amount(raw):
    """(magnitude, currency) from a Wise display string like
    '<positive>+ 1,234.56 EUR</positive>'. Sign lives in the 'positive'
    marker, not here."""
    parts = strip_html(raw or "").split()
    if len(parts) < 2:
        return 0.0, ""
    currency = parts[-1].upper()
    number = (
        "".join(parts[:-1]).replace("+", "").replace("-", "").replace(",", "")
    )
    try:
        return abs(float(number)), currency
    except ValueError:
        return 0.0, currency


def activity_text(activity):
    return (
        f"{strip_html(activity.get('title', ''))} "
        f"{strip_html(activity.get('description', ''))}"
    )


def vendor_for(text):
    low = text.lower()
    for vendor, aliases in VENDOR_ALIASES.items():
        if vendor == "other":
            continue
        values = set(aliases)
        values.add(vendor)
        if any(alias and alias.lower() in low for alias in values):
            return vendor
    return ""


def category_for(vendor, text, amount):
    low = text.lower()
    for keyword, category in VENDOR_CATEGORY_RULES.get(vendor, []):
        if keyword in low:
            return category
    for rule_amount, category in VENDOR_AMOUNT_RULES.get(vendor, []):
        if abs(amount - rule_amount) < 0.005:
            return category
    if vendor:
        return VENDOR_CATEGORIES[vendor]
    return "other"


def validate_rows(rows):
    for row in rows:
        missing = [column for column in COLUMNS if column not in row]
        if missing:
            raise ValueError(f"transactions row missing columns: {missing}")
        if not _DATE_RE.match(row["date"]):
            raise ValueError(f"bad transactions date: {row['date']!r}")
        if row["vendor"] and row["vendor"] not in VENDOR_ALIASES:
            raise ValueError(f"unknown vendor in transactions: {row['vendor']}")
        if row["category"] not in ALLOWED_CATEGORIES:
            raise ValueError(f"unknown category in transactions: {row['category']}")
        if not row["charged_currency"]:
            raise ValueError("transactions row missing charged_currency")
