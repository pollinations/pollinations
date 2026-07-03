"""Manual entry CLI for balance snapshots and meter readings.

Usage:
    python3 -m ingest.record balance <provider> [--granted N] [--spent N]
                                                [--left N] [--prepaid N]
                                                [--note TEXT]
    python3 -m ingest.record meter <provider> <YYYY-MM> <cost_usd>
                                   [--funding cash|credit|prepaid]
                                   [--method TEXT]

Appends one row to `balances` or `meter_monthly` with source="manual".
Provider must be in registry.CANONICAL; month must match YYYY-MM.
"""
import argparse
import datetime
import json
import re
import sys

from .connectors.providers import _brow, _mrow
from .connectors.registry import CANONICAL
from . import creds as _creds
from . import tb as _tb

_MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


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


def main(argv=None, tb_factory=None):
    """Entry point.

    tb_factory(token: str) → TB-like instance; injectable for tests.
    When None (production), reads TINYBIRD_OPS_INGEST_TOKEN from creds.
    """
    parser = argparse.ArgumentParser(
        prog="ingest.record",
        description="Manually append a balance or meter reading to Tinybird.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # balance subcommand
    bp = sub.add_parser("balance", help="append a balance snapshot")
    bp.add_argument("provider", help="canonical provider slug")
    bp.add_argument("--granted", type=float, default=None)
    bp.add_argument("--spent",   type=float, default=None)
    bp.add_argument("--left",    type=float, default=None)
    bp.add_argument("--prepaid", type=float, default=None)
    bp.add_argument("--currency", default="USD")
    bp.add_argument("--note", default="")

    # meter subcommand
    mp = sub.add_parser("meter", help="append a meter_monthly reading")
    mp.add_argument("provider",  help="canonical provider slug")
    mp.add_argument("month",     help="billing month YYYY-MM")
    mp.add_argument("cost_usd",  type=float, help="metered cost in USD")
    mp.add_argument("--funding", default="cash", choices=["cash", "credit", "prepaid"])
    mp.add_argument("--method",  default="manual", help="how the number was obtained")

    args = parser.parse_args(argv)

    # Resolve TB client
    if tb_factory is not None:
        client = tb_factory(None)  # token injected by factory; None is placeholder in tests
    else:
        c = _creds.load_creds()
        client = _default_tb_factory(c["TINYBIRD_OPS_INGEST_TOKEN"])

    if args.cmd == "balance":
        _validate_provider(args.provider)
        now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        row = _brow(now, args.provider,
                    granted=args.granted, spent=args.spent, left=args.left,
                    prepaid=args.prepaid, currency=args.currency,
                    source="manual", note=args.note)
        client.append("balances", [row])
        print(json.dumps(row))

    elif args.cmd == "meter":
        _validate_provider(args.provider)
        _validate_month(args.month)
        today = datetime.date.today().isoformat()
        row = _mrow(args.month, args.provider, args.cost_usd,
                    args.funding, "manual", args.method, today)
        client.append("meter_monthly", [row])
        print(json.dumps(row))


if __name__ == "__main__":
    main()
