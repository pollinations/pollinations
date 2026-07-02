"""Stripe-generated receipt/invoice parser.

Matches Anthropic, ElevenLabs, fal, xai-style Stripe PDFs.
"""
import re


_MONTH_MAP = {
    "January": "01", "February": "02", "March": "03", "April": "04",
    "May": "05", "June": "06", "July": "07", "August": "08",
    "September": "09", "October": "10", "November": "11", "December": "12",
}


def matches(txt, slug):
    has_number = "Receipt number" in txt or "Invoice number" in txt
    has_dollar = "$" in txt
    return has_number and has_dollar


def parse(txt, slug, config, today):
    """Parse Stripe receipt/invoice text.

    Returns:
        {
            "invoice": row_dict | None,
            "extras": {},
            "status": "parsed" | "needs_label"
        }
    """
    # Amount: "Amount paid  $42.00" or "Total  $150.00"
    amt_m = re.search(r"(?:Amount paid|Total)\s+\$?([\d,]+\.\d{2})", txt)
    # Invoice/receipt number
    num_m = re.search(r"(?:Invoice|Receipt) number:?\s*(\S+)", txt)
    # Date: "Date paid: June 1, 2026" or "Date due: May 15, 2026"
    date_m = re.search(r"Date (?:paid|due):?\s*([A-Z][a-z]+ \d{1,2}, \d{4})", txt)

    amount = 0.0
    if amt_m:
        amount = float(amt_m.group(1).replace(",", ""))

    invoice_number = num_m.group(1) if num_m else ""

    period_month = ""
    issued_at = ""
    if date_m:
        period_month = _date_to_month(date_m.group(1))
        issued_at = _date_to_iso(date_m.group(1))

    missing = not amt_m or not period_month
    status = "needs_label" if missing else "parsed"

    invoice = {
        "provider":       slug,
        "kind":           "",          # filled by extract_and_push from billing_map
        "currency":       "USD",
        "amount":         amount,
        "amount_usd":     amount,
        "period_month":   period_month,
        "invoice_number": invoice_number,
        "issued_at":      issued_at,
        "status":         status,
    }

    return {"invoice": invoice, "extras": {}, "status": status}


def _date_to_month(date_str):
    """'June 1, 2026' -> '2026-06'"""
    m = re.match(r"([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})", date_str)
    if not m:
        return ""
    month_num = _MONTH_MAP.get(m.group(1), "")
    if not month_num:
        return ""
    return f"{m.group(3)}-{month_num}"


def _date_to_iso(date_str):
    """'June 1, 2026' -> '2026-06-01'"""
    m = re.match(r"([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})", date_str)
    if not m:
        return ""
    month_num = _MONTH_MAP.get(m.group(1), "")
    if not month_num:
        return ""
    day = m.group(2).zfill(2)
    return f"{m.group(3)}-{month_num}-{day}"
