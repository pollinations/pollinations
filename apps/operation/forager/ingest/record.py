"""Manual entry CLI for meter readings and grant registrations.

Usage:
    python3 -m ingest.record provider <vendor> <YYYY-MM>
                                   --currency USD|EUR [--credit N] [--paid N]
    python3 -m ingest.record grant <vendor> --granted N --currency USD|EUR
                                   --start YYYY-MM-DD [--label L] [--expires YYYY-MM-DD]

`provider` appends one row to `provider_monthly` with source="manual".
`grant` appends one row to `grants` (raw grant facts; latest recorded_at wins
per (vendor, label) at read time — a correction is just a re-record).
Vendor must be in registry.CANONICAL.
"""
import argparse
import datetime
import json
import re
import sys

from .connectors.vendors import _currency, _validate_meter_source
from .connectors.registry import CANONICAL
from . import creds as _creds
from . import tb as _tb

_MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
_DATE_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$')
_CURRENCY_RE = re.compile(r"^[A-Z]{3,8}$")
_NO_EXPIRY = "1970-01-01"


def _default_tb_factory(token):
    """Real factory: build TB client for operations workspace ingest token."""
    cfg = _creds.load_config()
    return _tb.TB(cfg["tb_ops_api"], token)


def _validate_vendor(vendor):
    if vendor not in CANONICAL:
        print(f"error: unknown vendor '{vendor}'. known: {sorted(CANONICAL)}", file=sys.stderr)
        sys.exit(1)


def _validate_month(month):
    if not _MONTH_RE.match(month):
        print(f"error: month must be YYYY-MM (01–12), got '{month}'", file=sys.stderr)
        sys.exit(1)


def _validate_currency(currency):
    code = currency.strip().upper()
    if not _CURRENCY_RE.match(code):
        print(f"error: currency must be a code like USD or EUR, got '{currency}'", file=sys.stderr)
        sys.exit(1)
    return code


def _validate_amount(name, amount):
    if amount < 0:
        print(f"error: {name} must be >= 0, got '{amount}'", file=sys.stderr)
        sys.exit(1)


def _validate_date(name, value):
    if not _DATE_RE.match(value):
        print(f"error: {name} must be YYYY-MM-DD, got '{value}'", file=sys.stderr)
        sys.exit(1)


def main(argv=None, tb_factory=None):
    """Entry point.

    tb_factory(token: str) → TB-like instance; injectable for tests.
    When None (production), reads TINYBIRD_OPS_INGEST_TOKEN from creds.
    """
    parser = argparse.ArgumentParser(
        prog="ingest.record",
        description="Manually append a meter reading to Tinybird.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # provider subcommand
    mp = sub.add_parser("provider", help="append a provider_monthly reading")
    mp.add_argument("vendor",    help="canonical vendor slug")
    mp.add_argument("month",     help="billing month YYYY-MM")
    mp.add_argument("--currency", required=True, help="source currency code, e.g. USD or EUR")
    mp.add_argument("--credit", type=float, default=0.0, help="credit burn amount")
    mp.add_argument("--paid", type=float, default=0.0, help="paid/prepaid amount")

    # grant subcommand
    gp = sub.add_parser("grant", help="append a grants registration")
    gp.add_argument("vendor",     help="canonical vendor slug")
    gp.add_argument("--granted",  type=float, required=True, help="granted amount in source currency")
    gp.add_argument("--currency", required=True, help="source currency code, e.g. USD or EUR")
    gp.add_argument("--start",    required=True, help="grant start date YYYY-MM-DD")
    gp.add_argument("--label",    default="", help="distinguishes multiple grants per vendor")
    gp.add_argument("--expires",  default=_NO_EXPIRY, help="expiry date YYYY-MM-DD (omit = no expiry)")

    args = parser.parse_args(argv)

    # Resolve TB client
    if tb_factory is not None:
        client = tb_factory(None)  # token injected by factory; None is placeholder in tests
    else:
        c = _creds.load_creds()
        client = _default_tb_factory(c["TINYBIRD_OPS_INGEST_TOKEN"])

    if args.cmd == "provider":
        _validate_vendor(args.vendor)
        _validate_month(args.month)
        _validate_amount("credit", args.credit)
        _validate_amount("paid", args.paid)
        if args.credit == 0 and args.paid == 0:
            print("error: at least one of --credit or --paid must be > 0", file=sys.stderr)
            sys.exit(1)
        currency = _validate_currency(args.currency)
        _validate_meter_source("manual")
        row = {
            "month": args.month,
            "vendor": args.vendor,
            "currency": _currency(currency),
            "credit": round(float(args.credit), 2),
            "paid": round(float(args.paid), 2),
            "source": "manual",
        }
        client.append("provider_monthly", [row])
        print(json.dumps(row))

    elif args.cmd == "grant":
        _validate_vendor(args.vendor)
        _validate_amount("granted", args.granted)
        if args.granted == 0:
            print("error: --granted must be > 0", file=sys.stderr)
            sys.exit(1)
        _validate_date("start", args.start)
        _validate_date("expires", args.expires)
        currency = _validate_currency(args.currency)
        row = {
            "vendor": args.vendor,
            "label": args.label,
            "granted": round(float(args.granted), 2),
            "currency": _currency(currency),
            "start_date": args.start,
            "expires": args.expires,
            "recorded_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        }
        client.append("grants", [row])
        print(json.dumps(row))


if __name__ == "__main__":
    main()
