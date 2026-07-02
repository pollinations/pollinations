"""Generic best-effort invoice parser. Always matches last in the registry."""
import re


_MONTH_MAP = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "may": "05", "jun": "06", "jul": "07", "aug": "08",
    "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}


def matches(txt, slug):
    # Always matches — generic is the fallback of last resort
    return True


def parse(txt, slug, config, today):
    """Best-effort parse for any invoice.

    Returns:
        {
            "invoice": row_dict | None,
            "extras": {},
            "status": "parsed" | "needs_label"
        }
    """
    # Total: "total", "amount due", "amount paid", "grand total" followed by amount
    tot_m = re.search(
        r"(?:total|amount due|amount paid|grand total)\D{0,20}([\d,]+\.\d{2})",
        txt, re.IGNORECASE
    )

    amount = 0.0
    currency = "USD"
    if tot_m:
        amount = float(tot_m.group(1).replace(",", ""))
        # Look for currency near the match
        vicinity = txt[max(0, tot_m.start() - 30): tot_m.end() + 10]
        cur_m = re.search(r"(USD|EUR|\$|€)", vicinity)
        if cur_m:
            raw = cur_m.group(1)
            currency = "EUR" if raw in ("EUR", "€") else "USD"

    # Invoice/receipt number
    num_m = re.search(
        r"(?:invoice|receipt)\s*(?:no\.?|number|#)\s*:?\s*(\S+)",
        txt, re.IGNORECASE
    )
    invoice_number = num_m.group(1) if num_m else ""

    # Period: month of the latest parseable date; also capture full date if available
    period_month, issued_at = _latest_month_and_date(txt)
    period_month = period_month or ""

    # amount_usd
    fx = config.get("fx_eur_usd", 1.0)
    amount_usd = round(amount * fx, 6) if currency == "EUR" else amount

    missing = not tot_m or not period_month
    status = "needs_label" if missing else "parsed"

    invoice = {
        "provider":       slug,
        "kind":           "",          # filled by extract_and_push from billing_map
        "currency":       currency,
        "amount":         amount,
        "amount_usd":     amount_usd,
        "period_month":   period_month,
        "invoice_number": invoice_number,
        "issued_at":      issued_at,
        "status":         status,
    }

    return {"invoice": invoice, "extras": {}, "status": status}


def _latest_month_and_date(txt):
    """Return ('YYYY-MM', 'YYYY-MM-DD') of the latest full date found in txt.

    'YYYY-MM-DD' is only set when the source matched a full date (ISO or English
    with a day number).  Returns ('', '') if no date found.
    """
    # Each entry: (year, month, day_str_or_None)
    candidates = []

    # ISO: 2026-05-01
    for m in re.finditer(r"\b(\d{4})-(\d{2})-(\d{2})\b", txt):
        candidates.append((m.group(1), m.group(2), m.group(3)))

    # English: "June 1, 2026" or "Jun 1, 2026"
    for m in re.finditer(r"\b([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\b", txt):
        mo = _MONTH_MAP.get(m.group(1)[:3].lower())
        if mo:
            day = m.group(2).zfill(2)
            candidates.append((m.group(3), mo, day))

    if not candidates:
        return "", ""

    candidates.sort(reverse=True)
    year, month, day = candidates[0]
    period_month = f"{year}-{month}"
    issued_at = f"{year}-{month}-{day}"
    return period_month, issued_at
