"""Connector registry.

CANONICAL: full set of canonical provider slugs accepted by ingest.record and the
           burn engine.  Derived from the two already-test-enforced vocabularies:
             - harvest.PROVIDERS slugs (invoice classifier)
             - wise.ALIAS keys (payment matcher)
           Their union is the canonical vocabulary, matching credits.json pool slugs.

BALANCE / METER: lists of (slug, connector_fn) pairs.
           Populated by Tasks B3–B5.
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

# credits.json pool slugs not yet present in _harvest_slugs or _alias_slugs.
# Alias slugs (azure-2, aws-bedrock, bedrock (native)) are intentionally excluded —
# they canonicalize away in burn.py via CANON before reaching ingest.record.
_credits_json_pool_slugs = {
    "airforce",
    "bpai",
    "community",
    "self-hosted",
    "seraphyn",
    "aws-new",
}

CANONICAL: frozenset = frozenset(_harvest_slugs | _alias_slugs | _manual_forever | _credits_json_pool_slugs)

# B3: REST balance connectors
from .providers import openrouter as _openrouter
from .providers import deepinfra as _deepinfra
from .providers import runpod as _runpod
from .providers import scaleway as _scaleway
from .providers import digitalocean as _digitalocean
from .providers import daytona as _daytona

# B4: signed/CLI/derived balance connectors
from .providers import ovh as _ovh
from .providers import vast as _vast
from .providers import fireworks as _fw
from .providers import openai_ as _openai
from .providers import azure as _az

# B5: meter connectors
from .providers import aws as _aws
from .providers import gcp as _gcp

BALANCE: list = [
    ("openrouter", _openrouter.balance),
    ("deepinfra", _deepinfra.balance),
    ("runpod", _runpod.balance),
    ("scaleway", _scaleway.balance),
    ("digitalocean", _digitalocean.balance),
    ("daytona", _daytona.balance),
    # B4
    ("ovhcloud", _ovh.balance),
    ("vast.ai", _vast.balance),
    ("fireworks", _fw.balance),
    ("openai", _openai.balance),
    ("azure", _az.balance),
]

METER: list = [
    ("deepinfra", _deepinfra.meter),
    ("vast.ai", _vast.meter),
    ("ovhcloud", _ovh.meter),
    ("fireworks", _fw.meter),
    ("aws", _aws.meter),
    ("google", _gcp.meter),
    ("openai", _openai.meter),
]
