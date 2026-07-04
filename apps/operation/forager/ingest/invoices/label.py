"""Relabel an invoice row.

Rows are append-only for validated invoices: emits a corrected duplicate with
source='manual'. Non-invoice documents are represented by the deleted/ folder,
not by Tinybird rows.
The frontend/dedup always takes the latest row per sha256, preferring manual
rows, so a human correction wins over the original machine row.

file_ref and (unless overridden) category are carried over from the
best existing row for the sha256 so the correction never erases the PDF pointer.

Usage:
    python3 -m ingest.invoices.label <sha256> \\
        --provider vast.ai --month 2026-06 \\
        --amount 500 --currency USD \\
        [--category compute] [--number INV-123] [--date 2026-06-14]

    # Non-invoice document already present in Tinybird/local archive:
    python3 -m ingest.invoices.label <sha256> --not-invoice [--note "why"]
"""
import argparse
import json
import sys
import os
from datetime import datetime, timezone

# Allow running as a module from the treasury root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from ingest import creds as _creds, tb as _tb

CATEGORIES = ["compute", "infra", "saas", "admin", "office", "payroll", "other"]


def _all_providers(credits_data):
    """Known provider slugs: credits.json pools + harvest classifier + 'other'."""
    providers = set()
    for pool in credits_data.get("pools", []):
        providers.update(pool.get("providers", []))
    from ingest.invoices import harvest as _harvest
    providers.update(slug for slug, _cat, _needles in _harvest.PROVIDERS)
    providers.add("other")
    return sorted(providers)


def _existing_row(tb, sha256):
    """Best existing row for sha256 (label > parsed > latest), or {}."""
    from ingest.run import dedupe_invoices
    rows = tb.sql(f"SELECT * FROM invoices WHERE sha256 = '{sha256}'")
    if not rows:
        return {}
    return dedupe_invoices(rows)[0]


def main(argv=None, tb=None):
    parser = argparse.ArgumentParser(
        description="Relabel an invoice row."
    )
    parser.add_argument("sha256", help="SHA-256 of the invoice PDF")
    parser.add_argument("--not-invoice", action="store_true",
                        help="Move the existing PDF to deleted/ without appending to Tinybird.")
    parser.add_argument("--provider", help="Provider slug (e.g. vast.ai)")
    parser.add_argument("--month", help="Billing period YYYY-MM")
    parser.add_argument("--amount", type=float, help="Invoice amount")
    parser.add_argument("--credit", type=float,
                        help="Credits applied in USD (optional, default carried over or 0)")
    parser.add_argument("--currency", choices=["USD", "EUR"],
                        help="Invoice currency")
    parser.add_argument("--category", choices=CATEGORIES,
                        help="Category (default: carried over from existing row)")
    parser.add_argument("--number", default="", help="Invoice number (optional)")
    parser.add_argument("--note", default="",
                        help="Reason (stored in invoice_number field for "
                             "--not-invoice rows)")
    parser.add_argument("--date", default="",
                        help="Invoice issue date YYYY-MM-DD (optional; defaults to "
                             "<month>-01 — prepaid top-up matching is date-based ±10d, "
                             "so pass the real charge date for mid-month top-ups)")
    args = parser.parse_args(argv)

    if not args.not_invoice:
        missing = [f for f in ("provider", "month", "amount", "currency")
                   if getattr(args, f) is None]
        if missing:
            print(f"ERROR: missing required options: "
                  f"{', '.join('--' + m for m in missing)}", file=sys.stderr)
            sys.exit(1)

    if args.date:
        try:
            datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            print(f"ERROR: --date must be YYYY-MM-DD, got '{args.date}'", file=sys.stderr)
            sys.exit(1)

    if args.amount is not None and args.amount < 0:
        print("ERROR: --amount must be >= 0", file=sys.stderr)
        sys.exit(1)

    if args.credit is not None and args.credit < 0:
        print("ERROR: --credit must be >= 0", file=sys.stderr)
        sys.exit(1)

    # Load config and credits
    config = _creds.load_config()
    credits_data = _creds.load_credits()

    # Validate provider
    if args.provider:
        known = _all_providers(credits_data)
        if args.provider not in known:
            print(f"ERROR: unknown provider '{args.provider}'", file=sys.stderr)
            print(f"Known providers: {', '.join(known)}", file=sys.stderr)
            sys.exit(1)

    # Build TB client early — needed to carry over the existing row
    if tb is None:
        tb_cfg = _creds.load_creds()
        tb = _tb.TB(config["tb_ops_api"], tb_cfg["TINYBIRD_OPS_INGEST_TOKEN"])

    prev = _existing_row(tb, args.sha256)

    amount = args.amount if args.amount is not None else 0.0
    currency = args.currency or prev.get("currency", "USD")
    credit_usd = args.credit if args.credit is not None else float(prev.get("credit_usd") or 0.0)

    ingested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    if args.not_invoice:
        from ingest.invoices import harvest as _harvest

        file_ref = prev.get("file_ref", "")
        moved_to = ""
        if file_ref and os.path.exists(file_ref):
            moved_to = _harvest._move_deleted(
                config, file_ref, os.path.basename(file_ref), args.sha256,
                args.note or args.number or "manual_not_invoice",
            )
        row = {
            "sha256": args.sha256,
            "action": "moved_to_deleted" if moved_to else "no_tinybird_row",
            "file_ref": moved_to,
            "note": args.note or args.number,
        }
        print(json.dumps(row, indent=2))
        return row
    else:
        row = {
            "sha256":         args.sha256,
            "provider":       args.provider,
            "category":       args.category or prev.get("category", "") or "other",
            "period_month":   args.month,
            "amount":         amount,
            "currency":       currency,
            "invoice_number": args.number,
            "issued_at":      args.date or (args.month + "-01"),
            "source":         "manual",
            "file_ref":       prev.get("file_ref", ""),
            "ingested_at":    ingested_at,
            "credit_usd":     credit_usd,
        }

    tb.append("invoices", [row])

    print(json.dumps(row, indent=2))
    return row


if __name__ == "__main__":
    main()
