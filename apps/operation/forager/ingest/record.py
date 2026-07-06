"""Manual entry CLI for meter readings.

Usage:
    python3 -m ingest.record meter <provider> <YYYY-MM> <amount>
                                   --currency USD|EUR [--funding credit|prepaid|cash]

Appends one row to `meter_monthly` with source="manual".
Provider must be in registry.CANONICAL; month must match YYYY-MM.
"""
import argparse
import datetime
import json
import re
import sys

from .connectors.providers import _mrow
from .connectors.registry import CANONICAL
from . import creds as _creds
from . import tb as _tb

_MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
_CURRENCY_RE = re.compile(r"^[A-Z]{3,8}$")


def _default_tb_factory(token):
    """Real factory: build TB client for operations workspace ingest token."""
    cfg = _creds.load_config()
    return _tb.TB(cfg["tb_ops_api"], token)


def _validate_provider(provider):
    if provider not in CANONICAL:
        print(f"error: unknown provider '{provider}'. known: {sorted(CANONICAL)}", file=sys.stderr)
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

    # meter subcommand
    mp = sub.add_parser("meter", help="append a meter_monthly reading")
    mp.add_argument("provider",  help="canonical provider slug")
    mp.add_argument("month",     help="billing month YYYY-MM")
    mp.add_argument("amount",    type=float, help="metered cost in source currency")
    mp.add_argument("--currency", required=True, help="source currency code, e.g. USD or EUR")
    mp.add_argument("--funding", default="prepaid", choices=["credit", "prepaid", "cash"])

    args = parser.parse_args(argv)

    # Resolve TB client
    if tb_factory is not None:
        client = tb_factory(None)  # token injected by factory; None is placeholder in tests
    else:
        c = _creds.load_creds()
        client = _default_tb_factory(c["TINYBIRD_OPS_INGEST_TOKEN"])

    if args.cmd == "meter":
        _validate_provider(args.provider)
        _validate_month(args.month)
        currency = _validate_currency(args.currency)
        today = datetime.date.today().isoformat()
        row = _mrow(args.month, args.provider, args.amount,
                    args.funding, "manual", today, currency=currency)
        client.append("meter_monthly", [row])
        print(json.dumps(row))


if __name__ == "__main__":
    main()
