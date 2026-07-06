"""Vendor aliases.

Vendor identity lives in one metadata file:
`config/vendor_aliases.json`.

The file is the single vendor roster: each entry carries the identity aliases,
a default category, and optional per-row keyword `category_rules`. Category
rules are matched as lowercase substrings against row text by the consumer,
so a vendor can resolve to a different category depending on row context;
for example Anthropic API usage is compute while a Claude subscription is SaaS.

The same alias list supports two matching modes:
  - substring matching for human strings such as Wise counterparties
  - exact matching for machine vendor tags from generation events
"""

import json
from pathlib import Path

_ALIASES_PATH = Path(__file__).resolve().parents[1] / "config" / "vendor_aliases.json"

_ALLOWED_CATEGORIES = {
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
}


def _load_vendor_file() -> tuple[
    dict[str, list[str]],
    dict[str, str],
    dict[str, list[tuple[str, str]]],
    dict[str, list[tuple[float, str]]],
]:
    allowed = _ALLOWED_CATEGORIES
    raw = json.loads(_ALIASES_PATH.read_text())
    aliases_out: dict[str, list[str]] = {}
    categories_out: dict[str, str] = {}
    rules_out: dict[str, list[tuple[str, str]]] = {}
    amount_rules_out: dict[str, list[tuple[float, str]]] = {}
    for vendor, entry in raw.items():
        if not isinstance(vendor, str) or not vendor.strip():
            continue
        slug = vendor.strip().lower()
        values = {
            alias.strip().lower()
            for alias in entry.get("aliases", [])
            if isinstance(alias, str) and alias.strip()
        }
        values.add(slug)
        aliases_out[slug] = sorted(values)
        category = str(entry.get("category", "")).strip().lower()
        if category not in allowed:
            raise ValueError(f"vendor {slug} has invalid category: {category!r}")
        categories_out[slug] = category
        rules = []
        for rule in entry.get("category_rules", []):
            keyword = str(rule.get("match", "")).strip().lower()
            rule_category = str(rule.get("category", "")).strip().lower()
            if not keyword or rule_category not in allowed:
                raise ValueError(f"vendor {slug} has invalid category rule: {rule!r}")
            rules.append((keyword, rule_category))
        if rules:
            rules_out[slug] = rules
        amount_rules = []
        for rule in entry.get("amount_rules", []):
            rule_category = str(rule.get("category", "")).strip().lower()
            if "equals" not in rule or rule_category not in allowed:
                raise ValueError(f"vendor {slug} has invalid amount rule: {rule!r}")
            amount_rules.append((float(rule["equals"]), rule_category))
        if amount_rules:
            amount_rules_out[slug] = amount_rules
    return aliases_out, categories_out, rules_out, amount_rules_out


# canonical vendor slug -> identifying strings, used for substring matching.
# canonical vendor slug -> default category (validated against _ALLOWED_CATEGORIES).
# canonical vendor slug -> ordered (keyword, category) rules for row-context overrides.
# canonical vendor slug -> ordered (exact amount, category) rules for rows whose
# text carries no signal (e.g. fixed-price subscription seats).
VENDOR_ALIASES, VENDOR_CATEGORIES, VENDOR_CATEGORY_RULES, VENDOR_AMOUNT_RULES = (
    _load_vendor_file()
)

# raw vendor tag/name -> canonical vendor slug, used for exact matching.
VENDOR_TAG_ALIASES: dict[str, str] = {
    alias: vendor
    for vendor, aliases in VENDOR_ALIASES.items()
    for alias in aliases
    if alias != vendor
}


def canonical_vendor_tag(value: object) -> str:
    """Canonical vendor slug for exact machine tags.

    Empty values stay empty so callers can decide whether blanks are allowed.
    Non-empty unknown values remain visible for caller validation.
    """
    raw = "" if value is None else str(value).strip().lower()
    if not raw:
        return ""
    if raw in VENDOR_ALIASES:
        return raw
    return VENDOR_TAG_ALIASES.get(raw, raw)


def unknown_vendor_tags(rows, *, field: str = "vendor") -> list[str]:
    """Sorted non-empty vendor tags outside the canonical vocabulary."""
    unknown = set()
    for row in rows:
        value = row.get(field) if isinstance(row, dict) else None
        vendor = canonical_vendor_tag(value)
        if vendor and vendor not in VENDOR_ALIASES:
            unknown.add(str(value).strip())
    return sorted(unknown)
