"""PDF → text → parser registry.

First parser whose matches(txt, slug) returns True wins.
parse() is PURE — no file I/O, no creds reads.
extract_and_push() handles file I/O, sha256, kind derivation, and TB append.
"""
import hashlib
import re
import subprocess
from datetime import date as _date, datetime, timezone

from .parsers import REGISTRY, generic as _generic
from .. import creds as _creds

# Tinybird invoices datasource name
_DS = "invoices"

# Pool billing values → kind strings
_BILLING_KIND = {
    "monthly":      "monthly_bill",
    "prepaid":      "prepaid_topup",
    "reseller":     "reseller",
    "subscription": "subscription",
    "sponsored":    "monthly_bill",
}


def pdf_text(path):
    """Run pdftotext -layout and return stdout."""
    return subprocess.run(
        ["pdftotext", "-layout", path, "-"],
        capture_output=True, text=True, timeout=30
    ).stdout


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def parse(txt, slug, config, today):
    """Pure parse: txt string → structured result.

    Returns:
        {
            "invoice": row_dict (without sha256/file_ref/ingested_at/msgid/category/source),
            "extras":  dict (parser-specific side data),
            "status":  "parsed" | "needs_label"
        }
    Missing amount or period → status=needs_label, amount=0.0, period_month="".
    Fields are never None; use "" / 0.0 for missing strings / numbers.
    """
    for parser in REGISTRY:
        if parser.matches(txt, slug):
            out = parser.parse(txt, slug, config, today)
            inv = out.get("invoice")
            # Enforce no-None invariant and needs_label defaults
            if inv is not None:
                payable_amount, payable_currency, found_payable = _generic._find_payable_amount(txt)
                has_due_semantics = re.search(
                    r"\b(?:amount\s+due|invoice\s+amount)\b", txt, re.IGNORECASE
                )
                if found_payable and has_due_semantics:
                    fx = config.get("fx_eur_usd", 1.0)
                    inv["amount"] = payable_amount
                    inv["currency"] = payable_currency
                    inv["amount_usd"] = (
                        round(payable_amount * fx, 6)
                        if payable_currency == "EUR"
                        else payable_amount
                    )

                credit_usd = _generic._find_credit_usd(txt, config)
                if inv.get("credit_usd") is None or (
                    credit_usd > 0 and float(inv.get("credit_usd") or 0.0) == 0.0
                ):
                    inv["credit_usd"] = credit_usd

                if not inv.get("period_month"):
                    period_month, issued_at = _generic._latest_month_and_date(txt)
                    if period_month:
                        inv["period_month"] = period_month
                    if issued_at and not inv.get("issued_at"):
                        inv["issued_at"] = issued_at

                if out["status"] == "needs_label" and inv.get("period_month") and found_payable:
                    out["status"] = "parsed"

                if not inv.get("period_month"):
                    inv["period_month"] = ""
                    out["status"] = "needs_label"
                if not inv.get("amount") and inv.get("amount") != 0.0:
                    inv["amount"] = 0.0
                    out["status"] = "needs_label"
                if inv.get("credit_usd") is None:
                    inv["credit_usd"] = 0.0
                inv["status"] = out["status"]
            return out

    # Should never reach here (generic always matches), but be safe
    return {
        "invoice": {
            "provider": slug, "kind": "", "currency": "USD",
            "amount": 0.0, "amount_usd": 0.0,
            "credit_usd": 0.0,
            "period_month": "", "invoice_number": "", "issued_at": "",
            "status": "needs_label",
        },
        "extras": {},
        "status": "needs_label",
    }


def _build_billing_map(credits_data):
    """Build {provider_slug: kind_string} from credits.json pools."""
    bmap = {}
    for pool in credits_data.get("pools", []):
        billing = pool.get("billing", "")
        kind = _BILLING_KIND.get(billing, "unknown")
        for prov in pool.get("providers", []):
            bmap[prov] = kind
    return bmap


def build_row(path, slug, category, msgid, source, config, today,
              billing_map=None, ingested_at=None):
    """Extract invoice from PDF file and return one invoices datasource row.

    Args:
        path:        absolute path to the PDF file
        slug:        provider slug (e.g. "aws", "anthropic")
        category:    billing category string (e.g. "compute")
        msgid:       email message id (accepted for caller compatibility; not stored)
        source:      data source label (e.g. "email", "label")
        config:      config dict (needs "fx_eur_usd")
        today:       ISO date string "YYYY-MM-DD"
        billing_map: optional {provider: kind} dict; if None, built from creds
        ingested_at: optional UTC DateTime string; defaults to now
    """
    txt = pdf_text(path)
    file_hash = sha256(path)

    # Build billing_map if not provided
    if billing_map is None:
        credits_data = _creds.load_credits()
        billing_map = _build_billing_map(credits_data)

    result = parse(txt, slug, config, today)
    inv = result["invoice"]
    status = result["status"]

    # Derive kind from billing_map (automat_it parser hardcodes "reseller"; others get "")
    kind = inv.get("kind") or billing_map.get(slug, "unknown")

    currency = inv.get("currency", "USD")
    amount = inv.get("amount", 0.0)
    credit_usd = inv.get("credit_usd", 0.0)
    if credit_usd is None:
        credit_usd = 0.0

    if ingested_at is None:
        ingested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Validate period_month: must match YYYY-MM with month 01-12
    period_month = inv.get("period_month", "")
    if period_month and not re.match(r'^\d{4}-(0[1-9]|1[0-2])$', period_month):
        period_month = ""  # treat invalid period_month as missing

    # issued_at: validate parser value; fall back to period_month + "-01"; else sentinel
    parser_issued_at = inv.get("issued_at", "")
    issued_at = ""
    if parser_issued_at:
        try:
            _date.fromisoformat(parser_issued_at)
            issued_at = parser_issued_at
        except ValueError:
            pass  # fall through to period_month fallback
    if not issued_at and period_month:
        issued_at = period_month + "-01"
    if not issued_at:
        issued_at = "1970-01-01"

    row = {
        # Schema columns (invoices datasource)
        "sha256":          file_hash,
        "provider":        slug,
        "category":        category,
        "kind":            kind,
        "period_month":    period_month,
        "amount":          amount,
        "currency":        currency,
        "invoice_number":  inv.get("invoice_number", ""),
        "issued_at":       issued_at,
        "source":          source,
        "file_ref":        path,
        "status":          status,
        "ingested_at":     ingested_at,
        "credit_usd":      float(credit_usd),
    }

    return row


def extract_and_push(tb_ops, path, slug, category, msgid, source, config, today,
                     billing_map=None):
    """Extract invoice from PDF file and append one row to the invoices datasource.

    Always appends exactly one row (needs_label rows are never silently dropped).
    Returns the appended row dict.
    """
    row = build_row(path, slug, category, msgid, source, config, today,
                    billing_map=billing_map)
    tb_ops.append(_DS, [row])
    return row
