"""Automat-IT invoice parser.

Regexes ported character-for-character from:
  $SA/build/connectors/accrual.py lines 74-79 (automat_invoices function).
"""
import re


def matches(txt, slug):
    return "Automat-IT" in txt or "BILLING PERIOD" in txt


def parse(txt, slug, config, today):
    """Parse Automat-IT sales invoice text.

    Returns:
        {
            "invoice": row_dict | None,
            "extras": {"ait_credit_eur": float, "ait_credits_left_eur": float},
            "status": "parsed" | "needs_label"
        }
    """
    fx = config.get("fx_eur_usd", 1.0)

    # Regexes character-for-character from accrual.py:74-79
    per  = re.search(r"BILLING PERIOD:\s*\d{2}/(\d{2})/(\d{4})", txt)
    ref  = re.search(r"Tax Invoice-\s*(\S+)", txt)
    tot  = re.search(r"INVOICE TOTAL\s+EUR\s*([\d,]+\.?\d*)", txt)
    # layout: "Credits Used   EUR 0.87   -6,268.00 ea   -5,438.83"
    # qty is USD, LAST number is the EUR total
    cred = re.search(r"Credits Used\s+EUR\s*[\d.]+\s+-?[\d,]+\.?\d*\s*ea\s+(-?[\d,]+\.?\d*)", txt)
    rem  = re.search(r"remaining credits are\s*([\d,]+)\s*EUR", txt)

    period_month = ""
    if per:
        period_month = f"{per.group(2)}-{per.group(1)}"

    amount = 0.0
    if tot:
        amount = float(tot.group(1).replace(",", ""))

    invoice_number = ref.group(1) if ref else ""

    # Credit figures for extras
    credit_eur = abs(float(cred.group(1).replace(",", ""))) if cred else 0.0
    credits_left_eur = float(rem.group(1).replace(",", "")) if rem else 0.0

    missing = not period_month or not tot
    status = "needs_label" if missing else "parsed"

    invoice = {
        "provider":        slug,
        "kind":            "reseller",
        "currency":        "EUR",
        "amount":          amount,
        "amount_usd":      round(amount * fx, 6),
        "period_month":    period_month,
        "invoice_number":  invoice_number,
        "issued_at":       "",
        "status":          status,
    }

    extras = {
        "ait_credit_eur":      credit_eur,
        "ait_credits_left_eur": credits_left_eur,
    }

    return {"invoice": invoice, "extras": extras, "status": status}
