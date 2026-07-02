"""Relabel a needs_label invoice row.

Rows are append-only: emits a corrected duplicate with status='parsed'.
The frontend/dedup always takes the latest row per sha256.

Usage:
    python3 -m ingest.invoices.label <sha256> \\
        --provider vast.ai --month 2026-06 \\
        --amount 500 --currency USD --kind prepaid_topup \\
        [--number INV-123]
"""
import argparse
import json
import sys
import os
from datetime import datetime, timezone

# Allow running as a module from the treasury root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from ingest import creds as _creds, tb as _tb


def _all_providers(credits_data):
    """Return sorted list of all known provider slugs from credits.json pools."""
    providers = []
    for pool in credits_data.get("pools", []):
        providers.extend(pool.get("providers", []))
    return sorted(set(providers))


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Relabel a needs_label invoice row."
    )
    parser.add_argument("sha256", help="SHA-256 of the invoice PDF")
    parser.add_argument("--provider", required=True, help="Provider slug (e.g. vast.ai)")
    parser.add_argument("--month", required=True, help="Billing period YYYY-MM")
    parser.add_argument("--amount", required=True, type=float, help="Invoice amount")
    parser.add_argument("--currency", required=True, choices=["USD", "EUR"],
                        help="Invoice currency")
    parser.add_argument("--kind", required=True,
                        help="Billing kind (e.g. prepaid_topup, monthly_bill)")
    parser.add_argument("--number", default="", help="Invoice number (optional)")
    args = parser.parse_args(argv)

    # Load config and credits
    config = _creds.load_config()
    credits_data = _creds.load_credits()

    # Validate provider
    known = _all_providers(credits_data)
    if args.provider not in known:
        print(f"ERROR: unknown provider '{args.provider}'", file=sys.stderr)
        print(f"Known providers: {', '.join(known)}", file=sys.stderr)
        sys.exit(1)

    # Compute amount_usd
    fx = config.get("fx_eur_usd", 1.0)
    amount_usd = round(args.amount * fx, 6) if args.currency == "EUR" else args.amount

    ingested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    row = {
        "sha256":         args.sha256,
        "msgid":          "",
        "provider":       args.provider,
        "category":       "",
        "kind":           args.kind,
        "period_month":   args.month,
        "amount":         args.amount,
        "currency":       args.currency,
        "amount_usd":     amount_usd,
        "invoice_number": args.number,
        "issued_at":      args.month + "-01",
        "source":         "label",
        "file_ref":       "",
        "status":         "parsed",
        "ingested_at":    ingested_at,
    }

    # Push to Tinybird
    tb_cfg = _creds.load_creds()
    t = _tb.TB(config["tb_ops_api"], tb_cfg["TB_OPS_TOKEN"])
    t.append("invoices", [row])

    print(json.dumps(row, indent=2))
    return row


if __name__ == "__main__":
    main()
