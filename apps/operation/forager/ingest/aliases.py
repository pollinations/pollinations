"""Provider aliases.

Provider identity lives in one metadata file:
`config/provider_aliases.json`.

The file is intentionally category-free. A provider can appear in multiple
spend categories depending on the row context; for example Anthropic API usage
can be compute while Claude subscription spend is SaaS. Category is assigned by
the connector/classifier that creates the row, not by provider identity.

The same alias list supports two matching modes:
  - substring matching for human strings such as Wise counterparties
  - exact matching for machine provider tags from generation events
"""

import json
from pathlib import Path

_ALIASES_PATH = Path(__file__).resolve().parents[1] / "config" / "provider_aliases.json"


def _load_provider_aliases() -> dict[str, list[str]]:
    raw = json.loads(_ALIASES_PATH.read_text())
    out: dict[str, list[str]] = {}
    for provider, aliases in raw.items():
        if not isinstance(provider, str) or not provider.strip():
            continue
        slug = provider.strip().lower()
        values = {
            alias.strip().lower()
            for alias in aliases
            if isinstance(alias, str) and alias.strip()
        }
        values.add(slug)
        out[slug] = sorted(values)
    return out


# canonical provider slug -> identifying strings, used for substring matching.
PROVIDER_ALIASES: dict[str, list[str]] = _load_provider_aliases()

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
