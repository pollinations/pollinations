"""Vendor alias metadata tests."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import aliases
from ingest.connectors import registry


def test_vendor_aliases_are_lists():
    assert aliases.VENDOR_ALIASES["aws"]
    assert all(isinstance(v, list) for v in aliases.VENDOR_ALIASES.values())


def test_every_vendor_has_valid_category():
    from ingest.aliases import VENDOR_ALIASES, VENDOR_CATEGORIES

    allowed = {"compute", "infra", "saas", "admin", "office", "payroll", "other"}
    assert set(VENDOR_CATEGORIES) == set(VENDOR_ALIASES)
    assert set(VENDOR_CATEGORIES.values()) <= allowed


def test_category_rules_are_lowercased_ordered_pairs():
    from ingest.aliases import VENDOR_CATEGORIES, VENDOR_CATEGORY_RULES

    assert set(VENDOR_CATEGORY_RULES) <= set(VENDOR_CATEGORIES)
    for rules in VENDOR_CATEGORY_RULES.values():
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
    from ingest.aliases import VENDOR_CATEGORIES, VENDOR_CATEGORY_RULES

    assert VENDOR_CATEGORIES["anthropic"] == "compute"
    assert ("claude.ai subscription", "saas") in VENDOR_CATEGORY_RULES["anthropic"]
    assert VENDOR_CATEGORIES["openai"] == "compute"
    assert ("chatgpt", "saas") in VENDOR_CATEGORY_RULES["openai"]


def test_vendor_aliases_shape_unchanged():
    from ingest.aliases import VENDOR_ALIASES

    assert isinstance(VENDOR_ALIASES["aws"], list)
    assert "amazon web" in VENDOR_ALIASES["aws"]
    assert list(VENDOR_ALIASES["aws"]) == sorted(VENDOR_ALIASES["aws"])


def test_same_alias_file_feeds_substring_and_exact_matching():
    assert "amazon web" in aliases.VENDOR_ALIASES["aws"]
    assert aliases.VENDOR_TAG_ALIASES["automat-it"] == "aws"
    assert aliases.VENDOR_TAG_ALIASES["bedrock"] == "aws"
    assert aliases.VENDOR_TAG_ALIASES["vastai"] == "vast.ai"
    assert aliases.VENDOR_TAG_ALIASES["azure-2"] == "azure"


def test_alias_file_is_registry_canonical_source():
    assert registry.CANONICAL == frozenset(aliases.VENDOR_ALIASES.keys())


def test_aws_has_one_canonical_vendor():
    assert "aws" in registry.CANONICAL
    assert "aws-new" not in registry.CANONICAL
    assert [slug for slug in registry.CANONICAL if slug.startswith("aws")] == ["aws"]
