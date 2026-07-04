"""Provider alias metadata tests."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import aliases
from ingest.connectors import registry


def test_provider_aliases_are_category_free():
    assert aliases.PROVIDER_ALIASES["aws"]
    assert all(isinstance(v, list) for v in aliases.PROVIDER_ALIASES.values())


def test_same_alias_file_feeds_substring_and_exact_matching():
    assert "amazon web" in aliases.PROVIDER_ALIASES["aws"]
    assert aliases.PROVIDER_TAG_ALIASES["bedrock"] == "aws"
    assert aliases.PROVIDER_TAG_ALIASES["vastai"] == "vast.ai"
    assert aliases.PROVIDER_TAG_ALIASES["azure-2"] == "azure"


def test_alias_file_is_registry_canonical_source():
    assert registry.CANONICAL == frozenset(aliases.PROVIDER_ALIASES.keys())
