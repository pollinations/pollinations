"""Connector registry.

CANONICAL: full set of canonical provider slugs accepted by ingest.record and the
           burn engine.  Derived from the two already-test-enforced vocabularies:
             - harvest.PROVIDERS slugs (invoice classifier)
             - wise.ALIAS keys (payment matcher)
           Their union is the canonical vocabulary, matching credits.json pool slugs.

BALANCE / METER: lists of (slug, connector_fn) pairs.
           Populated by Tasks B3–B5 — empty here.
"""

# Derive from the two already-canonical vocabularies (test-enforced against credits.json)
from ..invoices.harvest import PROVIDERS as _PROVIDERS
from .wise import ALIAS as _ALIAS

# Only "compute" and "infra" categories represent billing providers.
# "saas", "payroll", and "other" are invoice-sender slugs (office/tools/payroll/self)
# that must NOT be accepted as valid meter/balance targets.
_BILLING_CATEGORIES = {"compute", "infra"}

# Slugs from invoice classifier — billing categories only
_harvest_slugs = {slug for slug, cat, _keys in _PROVIDERS if cat in _BILLING_CATEGORIES}

# Slugs from Wise payment matcher
_alias_slugs = set(_ALIAS.keys())

# Manual-forever providers (no programmatic API surface — ingest.record + note only).
# These appear in credits.json pools but have no connector and may not appear in
# PROVIDERS/ALIAS (they're listed here explicitly to make CANONICAL complete).
_manual_forever = {
    "nebius",  # no public billing API; not in ALIAS
}

CANONICAL: frozenset = frozenset(_harvest_slugs | _alias_slugs | _manual_forever)

# Populated by Tasks B3–B5.  See brief for final state.
BALANCE: list = []
METER: list = []
