"""Manual entry CLI for meter readings and grant registrations.

Usage:
    python3 -m ingest.record provider <vendor> <YYYY-MM>
                                   --currency USD|EUR [--credit N] [--paid N]
    python3 -m ingest.record grant <vendor> --granted N --currency USD|EUR
                                   --start YYYY-MM-DD [--label L] [--expires YYYY-MM-DD]
    python3 -m ingest.record gpu <vendor> <YYYY-MM> --deployment <name>
                                   --amount <usd> [--run-id <id>] [--gpu-count N]
                                   [--started 'YYYY-MM-DD HH:MM:SS' --ended '...']
                                   [--model <csv>] [--kind gpu|serverless]
                                   [--gpu <label>] [--currency USD]

`provider` appends one row to `provider_monthly` with source="manual".
`grant` appends one row to `grants` (raw grant facts; latest recorded_at wins
per (vendor, label) at read time — a correction is just a re-record).
`gpu` appends to `gpu_runs` with source="manual". Two modes: with neither
--started nor --ended, one month-grain lump row is emitted (e.g. OVH GPU);
with both, --amount is the full run cost and gets split across months via
split_run_rows (e.g. io.net/lambda real runs) — the positional month then
acts as a guard that must match one of the produced months.
Vendor must be in registry.CANONICAL.
"""
import argparse
import datetime
import json
import re
import sys

from .aliases import VENDOR_CATEGORIES, GPU_VENDORS
from .connectors.gpu_runs import split_run_rows, stamp
from .connectors.vendors import _currency, _validate_meter_source
from .connectors.registry import CANONICAL
from . import creds as _creds
from . import tb as _tb

_MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
_DATE_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$')
_CURRENCY_RE = re.compile(r"^[A-Z]{3,8}$")
_TIME_FMT = "%Y-%m-%d %H:%M:%S"
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
    mp.add_argument("--category", choices=["compute", "infra", "compute-gpu"], default=None,
                    help="infra rows fund pools/cash but stay out of compute lenses; "
                         "compute-gpu is the GPU-rent slice of compute "
                         "(default: the vendor's category from vendor_aliases.json)")

    # grant subcommand
    gp = sub.add_parser("grant", help="append a grants registration")
    gp.add_argument("vendor",     help="canonical vendor slug")
    gp.add_argument("--granted",  type=float, required=True, help="granted amount in source currency")
    gp.add_argument("--currency", required=True, help="source currency code, e.g. USD or EUR")
    gp.add_argument("--start",    required=True, help="grant start date YYYY-MM-DD")
    gp.add_argument("--label",    default="", help="distinguishes multiple grants per vendor")
    gp.add_argument("--expires",  default=_NO_EXPIRY, help="expiry date YYYY-MM-DD (omit = no expiry)")

    # gpu subcommand
    gup = sub.add_parser("gpu", help="append a gpu_runs row")
    gup.add_argument("vendor",       help="canonical vendor slug")
    gup.add_argument("month",        help="billing month YYYY-MM (guard month in run mode)")
    gup.add_argument("--deployment", required=True, help="pod/instance name or provider id")
    gup.add_argument("--amount",     type=float, required=True,
                     help="billed USD (lump mode: for the month; run mode: for the whole run)")
    gup.add_argument("--gpu",        default="", help="GPU display name (optional)")
    gup.add_argument("--currency",   default="USD", help="currency code (default: USD)")
    gup.add_argument("--run-id",     default=None, help="run identifier (default: --deployment)")
    gup.add_argument("--gpu-count",  type=int, default=1, help="GPU count (default: 1)")
    gup.add_argument("--started",    default=None, help="run start 'YYYY-MM-DD HH:MM:SS' (run mode)")
    gup.add_argument("--ended",      default=None, help="run end 'YYYY-MM-DD HH:MM:SS' (run mode)")
    gup.add_argument("--model",      default=None, help="models_csv (default: stamp(vendor, deployment))")
    gup.add_argument("--kind",       default=None, choices=["gpu", "serverless"],
                     help="default: stamp(vendor, deployment)")

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
        # Roster default (vendor_aliases.json) is only ever compute or infra;
        # vendors whose roster category is anything else (saas, admin, ...)
        # still default compute. compute-gpu is never a roster default — it
        # must be passed explicitly via --category for a manual GPU row.
        category = args.category or (
            VENDOR_CATEGORIES[args.vendor]
            if VENDOR_CATEGORIES.get(args.vendor) in ("compute", "infra")
            else "compute"
        )
        row = {
            "month": args.month,
            "vendor": args.vendor,
            "currency": _currency(currency),
            "category": category,
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

    elif args.cmd == "gpu":
        _validate_vendor(args.vendor)
        # Vendor must be canonical (already validated above), not just GPU_VENDORS.
        # Real audit data includes GPU line items from non-roster-GPU vendors
        # (e.g. ovhcloud rented GPU instances). gpu_runs is the audit ledger
        # and must accept any canonical vendor.
        _validate_month(args.month)
        if args.amount <= 0:
            print(f"error: --amount must be > 0, got '{args.amount}'", file=sys.stderr)
            sys.exit(1)
        currency = _currency(_validate_currency(args.currency))
        run_id = args.run_id if args.run_id is not None else args.deployment

        stamp_model, stamp_kind = stamp(args.vendor, args.deployment)
        model = args.model if args.model is not None else stamp_model
        kind = args.kind if args.kind is not None else stamp_kind

        has_started = args.started is not None
        has_ended = args.ended is not None
        if has_started != has_ended:
            print(
                "error: --started and --ended must be given together (both or neither)",
                file=sys.stderr,
            )
            sys.exit(1)

        def _base_row(month, started_at, ended_at, hours, cost):
            return {
                "month": month,
                "vendor": args.vendor,
                "run_id": run_id,
                "deployment": args.deployment,
                "gpu": args.gpu,
                "gpu_count": args.gpu_count,
                "started_at": started_at,
                "ended_at": ended_at,
                "hours": hours,
                "cost": cost,
                "currency": currency,
                "model": model,
                "kind": kind,
                "source": "manual",
            }

        if has_started and has_ended:
            try:
                started_dt = datetime.datetime.strptime(args.started, _TIME_FMT)
            except ValueError:
                print(
                    f"error: --started must be 'YYYY-MM-DD HH:MM:SS', got '{args.started}'",
                    file=sys.stderr,
                )
                sys.exit(1)
            try:
                ended_dt = datetime.datetime.strptime(args.ended, _TIME_FMT)
            except ValueError:
                print(
                    f"error: --ended must be 'YYYY-MM-DD HH:MM:SS', got '{args.ended}'",
                    file=sys.stderr,
                )
                sys.exit(1)

            try:
                parts = split_run_rows(started_dt, ended_dt, args.amount, args.gpu_count)
            except ValueError as e:
                print(f"error: {e}", file=sys.stderr)
                sys.exit(1)

            months_produced = [p["month"] for p in parts]
            if args.month not in months_produced:
                print(
                    f"error: run {months_produced[0]}..{months_produced[-1]} "
                    f"produces no row for guard month {args.month}",
                    file=sys.stderr,
                )
                sys.exit(1)

            rows = [
                _base_row(p["month"], p["started_at"], p["ended_at"], p["hours"], p["cost"])
                for p in parts
            ]
        else:
            rows = [_base_row(args.month, "", "", None, round(float(args.amount), 2))]

        client.append("gpu_runs", rows)
        for row in rows:
            print(json.dumps(row))


if __name__ == "__main__":
    main()
