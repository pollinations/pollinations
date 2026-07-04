"""Connector registry.

CANONICAL: full set of canonical provider slugs accepted by ingest.record.
           Provider identity is defined in config/provider_aliases.json.

METER: list of (slug, connector_fn) pairs.
"""

from ..aliases import PROVIDER_ALIASES

CANONICAL: frozenset = frozenset(PROVIDER_ALIASES.keys())

from .providers import deepinfra as _deepinfra
from .providers import ovh as _ovh
from .providers import vast as _vast
from .providers import fireworks as _fw
from .providers import openai_ as _openai

from .providers import aws as _aws
from .providers import gcp as _gcp

METER: list = [
    ("deepinfra", _deepinfra.meter),
    ("vast.ai", _vast.meter),
    ("ovhcloud", _ovh.meter),
    ("fireworks", _fw.meter),
    ("aws", _aws.meter),
    ("google", _gcp.meter),
    ("openai", _openai.meter),
]
