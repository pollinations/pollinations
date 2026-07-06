"""Provider aliases.

Provider identity lives in one metadata file:
`config/provider_aliases.json`.

The file is the single vendor roster: each entry carries the identity aliases,
a default category, and optional per-row keyword `category_rules`. Category
rules are matched as lowercase substrings against row text by the consumer,
so a provider can resolve to a different category depending on row context;
for example Anthropic API usage is compute while a Claude subscription is SaaS.

The same alias list supports two matching modes:
  - substring matching for human strings such as Wise counterparties
  - exact matching for machine provider tags from generation events
"""

import json
from pathlib import Path

_ALIASES_PATH = Path(__file__).resolve().parents[1] / "config" / "provider_aliases.json"

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
]:
    allowed = _ALLOWED_CATEGORIES
    raw = json.loads(_ALIASES_PATH.read_text())
    aliases_out: dict[str, list[str]] = {}
    categories_out: dict[str, str] = {}
    rules_out: dict[str, list[tuple[str, str]]] = {}
    for provider, entry in raw.items():
        if not isinstance(provider, str) or not provider.strip():
            continue
        slug = provider.strip().lower()
        values = {
            alias.strip().lower()
            for alias in entry.get("aliases", [])
            if isinstance(alias, str) and alias.strip()
        }
        values.add(slug)
        aliases_out[slug] = sorted(values)
        category = str(entry.get("category", "")).strip().lower()
        if category not in allowed:
            raise ValueError(f"provider {slug} has invalid category: {category!r}")
        categories_out[slug] = category
        rules = []
        for rule in entry.get("category_rules", []):
            keyword = str(rule.get("match", "")).strip().lower()
            rule_category = str(rule.get("category", "")).strip().lower()
            if not keyword or rule_category not in allowed:
                raise ValueError(f"provider {slug} has invalid category rule: {rule!r}")
            rules.append((keyword, rule_category))
        if rules:
            rules_out[slug] = rules
    return aliases_out, categories_out, rules_out


# canonical provider slug -> identifying strings, used for substring matching.
# canonical provider slug -> default category (validated against _ALLOWED_CATEGORIES).
# canonical provider slug -> ordered (keyword, category) rules for row-context overrides.
PROVIDER_ALIASES, PROVIDER_CATEGORIES, PROVIDER_CATEGORY_RULES = _load_vendor_file()

# raw provider tag/name -> canonical provider slug, used for exact matching.
PROVIDER_TAG_ALIASES: dict[str, str] = {
    alias: provider
    for provider, aliases in PROVIDER_ALIASES.items()
    for alias in aliases
    if alias != provider
}


def canonical_provider_tag(value: object) -> str:
    """Canonical provider slug for exact machine tags.

    Empty values stay empty so callers can decide whether blanks are allowed.
    Non-empty unknown values remain visible for caller validation.
    """
    raw = "" if value is None else str(value).strip().lower()
    if not raw:
        return ""
    if raw in PROVIDER_ALIASES:
        return raw
    return PROVIDER_TAG_ALIASES.get(raw, raw)


def unknown_provider_tags(rows, *, field: str = "provider") -> list[str]:
    """Sorted non-empty provider tags outside the canonical vocabulary."""
    unknown = set()
    for row in rows:
        value = row.get(field) if isinstance(row, dict) else None
        provider = canonical_provider_tag(value)
        if provider and provider not in PROVIDER_ALIASES:
            unknown.add(str(value).strip())
    return sorted(unknown)
