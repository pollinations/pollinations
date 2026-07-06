"""Provider alias metadata tests."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import aliases
from ingest.connectors import registry


def test_provider_aliases_are_lists():
    assert aliases.PROVIDER_ALIASES["aws"]
    assert all(isinstance(v, list) for v in aliases.PROVIDER_ALIASES.values())


def test_every_provider_has_valid_category():
    from ingest.aliases import PROVIDER_ALIASES, PROVIDER_CATEGORIES

    allowed = {"compute", "infra", "saas", "admin", "office", "payroll", "other"}
    assert set(PROVIDER_CATEGORIES) == set(PROVIDER_ALIASES)
    assert set(PROVIDER_CATEGORIES.values()) <= allowed


def test_category_rules_are_lowercased_ordered_pairs():
    from ingest.aliases import PROVIDER_CATEGORIES, PROVIDER_CATEGORY_RULES

    assert set(PROVIDER_CATEGORY_RULES) <= set(PROVIDER_CATEGORIES)
    for rules in PROVIDER_CATEGORY_RULES.values():
        for keyword, category in rules:
            assert keyword == keyword.lower() and keyword.strip()
            assert category in {
                "compute",
                "infra",
                "saas",
                "admin",
                "office",
                "payroll",
                "other",
            }


def test_anthropic_and_openai_have_subscription_rules():
    from ingest.aliases import PROVIDER_CATEGORIES, PROVIDER_CATEGORY_RULES

    assert PROVIDER_CATEGORIES["anthropic"] == "compute"
    assert ("claude.ai subscription", "saas") in PROVIDER_CATEGORY_RULES["anthropic"]
    assert PROVIDER_CATEGORIES["openai"] == "compute"
    assert ("chatgpt", "saas") in PROVIDER_CATEGORY_RULES["openai"]


def test_provider_aliases_shape_unchanged():
    from ingest.aliases import PROVIDER_ALIASES

    assert isinstance(PROVIDER_ALIASES["aws"], list)
    assert "amazon web" in PROVIDER_ALIASES["aws"]
    assert list(PROVIDER_ALIASES["aws"]) == sorted(PROVIDER_ALIASES["aws"])


def test_same_alias_file_feeds_substring_and_exact_matching():
    assert "amazon web" in aliases.PROVIDER_ALIASES["aws"]
    assert aliases.PROVIDER_TAG_ALIASES["automat-it"] == "aws"
    assert aliases.PROVIDER_TAG_ALIASES["bedrock"] == "aws"
    assert aliases.PROVIDER_TAG_ALIASES["vastai"] == "vast.ai"
    assert aliases.PROVIDER_TAG_ALIASES["azure-2"] == "azure"


def test_alias_file_is_registry_canonical_source():
    assert registry.CANONICAL == frozenset(aliases.PROVIDER_ALIASES.keys())


def test_aws_has_one_canonical_provider():
    assert "aws" in registry.CANONICAL
    assert "aws-new" not in registry.CANONICAL
    assert [slug for slug in registry.CANONICAL if slug.startswith("aws")] == ["aws"]
