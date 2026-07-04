"""Gather invoice-like Gmail PDF attachments into inbox/.

Run from apps/operation/forager:
    python3 -m ingest.invoices.gmail --month 2026-07
"""
import argparse

from .. import creds
from . import harvest


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Download Gmail invoice PDFs into the invoice inbox."
    )
    parser.add_argument("--month", required=True, help="Month to gather, YYYY-MM.")
    args = parser.parse_args(argv)

    cfg = creds.load_config()
    stats = harvest.gmail_gather_month(cfg, args.month)
    print(f"invoice-gmail-gather: {stats}")


if __name__ == "__main__":
    main()
