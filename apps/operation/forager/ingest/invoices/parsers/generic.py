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
    amount, currency, found_amount = _find_payable_amount(txt)
    credit_usd = _find_credit_usd(txt, config)

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

    missing = not found_amount or not period_month
    status = "needs_label" if missing else "parsed"

    invoice = {
        "provider":       slug,
        "kind":           "",          # filled by extract_and_push from billing_map
        "currency":       currency,
        "amount":         amount,
        "amount_usd":     amount_usd,
        "credit_usd":     credit_usd,
        "period_month":   period_month,
        "invoice_number": invoice_number,
        "issued_at":      issued_at,
        "status":         status,
    }

    return {"invoice": invoice, "extras": {}, "status": status}


_MONEY_RE = re.compile(
    r"(?P<cur>USD|EUR|\$|€)?\s*(?P<neg>-|\()?[\s$€]*"
    r"(?P<num>(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2}))\s*(?P<close>\))?",
    re.IGNORECASE,
)


def _money_matches(text):
    for match in _MONEY_RE.finditer(text):
        raw_cur = match.group("cur") or ""
        yield {
            "amount": float(match.group("num").replace(",", "")),
            "currency": "EUR" if raw_cur.upper() == "EUR" or raw_cur == "€" else "USD",
            "negative": match.group("neg") == "-" or (
                match.group("neg") == "(" and match.group("close") == ")"
            ),
        }


def _find_payable_amount(txt):
    """Return (amount, currency, found) using amount-due semantics.

    Precedence is intentionally ordered so "Amount Due $0" beats earlier
    "Sub Total $384.47" lines on credit-covered invoices.
    """
    label_groups = [
        (re.compile(r"\bamount\s+due\b", re.IGNORECASE), False),
        (re.compile(r"\binvoice\s+amount\b", re.IGNORECASE), False),
        (re.compile(r"\b(?:grand\s+total|amount\s+paid|total)\b", re.IGNORECASE), True),
        (re.compile(r"\bsub\s*total\b", re.IGNORECASE), False),
    ]
    lines = txt.splitlines()
    for pattern, skip_subtotal in label_groups:
        for i, line in enumerate(lines):
            if not pattern.search(line):
                continue
            low = line.lower()
            if skip_subtotal and re.search(r"\bsub\s*total\b", low):
                continue
            segment = line
            if i + 1 < len(lines):
                segment += " " + lines[i + 1]
            matches = list(_money_matches(segment))
            if matches:
                money = matches[0]
                return money["amount"], money["currency"], True
    return 0.0, "USD", False


def _find_credit_usd(txt, config):
    """Sum applied-credit lines as a positive USD number."""
    lines = txt.splitlines()
    detail_start = next(
        (i + 1 for i, line in enumerate(lines)
         if "discounts/credits applied" in line.lower()),
        None,
    )
    if detail_start is not None:
        total = _sum_credit_lines(lines[detail_start:], config)
        if total > 0:
            return total
        return _sum_credit_lines(lines[:detail_start], config)
    return _sum_credit_lines(lines, config)


def _sum_credit_lines(lines, config):
    total = 0.0
    for line in lines:
        low = line.lower()
        if "credit" not in low:
            continue
        if any(word in low for word in ("remaining", "available", "balance", "left")):
            continue
        matches = list(_money_matches(line))
        if not matches:
            continue
        signed = [m for m in matches if m["negative"]]
        if signed:
            selected = signed
        elif len(matches) == 1 and any(word in low for word in ("applied", "promotional")):
            selected = matches
        else:
            selected = []
        for money in selected:
            amount = money["amount"]
            if money["currency"] == "EUR":
                amount *= config.get("fx_eur_usd", 1.0)
            total += amount
    return round(total, 6)


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
