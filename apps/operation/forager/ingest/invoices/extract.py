"""PDF → text → parser registry.

First parser whose matches(txt, slug) returns True wins.
parse() is PURE — no file I/O, no creds reads.
extract_and_push() handles file I/O, sha256, kind derivation, and TB append.
"""
import hashlib
import subprocess
from datetime import datetime, timezone

from .parsers import REGISTRY
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
                if not inv.get("period_month"):
                    inv["period_month"] = ""
                    out["status"] = "needs_label"
                if not inv.get("amount") and inv.get("amount") != 0.0:
                    inv["amount"] = 0.0
                    out["status"] = "needs_label"
                # Canonicalise amount=0.0 when needs_label
                if out["status"] == "needs_label":
                    if not inv.get("amount"):
                        inv["amount"] = 0.0
                    if not inv.get("period_month"):
                        inv["period_month"] = ""
                inv["status"] = out["status"]
            return out

    # Should never reach here (generic always matches), but be safe
    return {
        "invoice": {
            "provider": slug, "kind": "", "currency": "USD",
            "amount": 0.0, "amount_usd": 0.0,
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


def extract_and_push(tb_ops, path, slug, category, msgid, source, config, today,
                     billing_map=None):
    """Extract invoice from PDF file and append one row to the invoices datasource.

    Always appends exactly one row (needs_label rows are never silently dropped).
    Returns the appended row dict.

    Args:
        tb_ops:      TB instance (has .append method)
        path:        absolute path to the PDF file
        slug:        provider slug (e.g. "aws", "anthropic")
        category:    billing category string (e.g. "compute")
        msgid:       email message id (for dedup tracking)
        source:      data source label (e.g. "email", "label")
        config:      config dict (needs "fx_eur_usd")
        today:       ISO date string "YYYY-MM-DD"
        billing_map: optional {provider: kind} dict; if None, built from creds
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

    # Recompute amount_usd based on final currency (parser may have set it; reconfirm)
    currency = inv.get("currency", "USD")
    amount = inv.get("amount", 0.0)
    fx = config.get("fx_eur_usd", 1.0)
    amount_usd = round(amount * fx, 6) if currency == "EUR" else amount

    ingested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    row = {
        # Schema columns (invoices datasource)
        "sha256":          file_hash,
        "msgid":           msgid,
        "provider":        slug,
        "category":        category,
        "kind":            kind,
        "period_month":    inv.get("period_month", ""),
        "amount":          amount,
        "currency":        currency,
        "amount_usd":      amount_usd,
        "invoice_number":  inv.get("invoice_number", ""),
        "issued_at":       inv.get("issued_at", ""),
        "source":          source,
        "file_ref":        path,
        "status":          status,
        "ingested_at":     ingested_at,
    }

    tb_ops.append(_DS, [row])
    return row
