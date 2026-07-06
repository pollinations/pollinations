"""Connector registry.

CANONICAL: full set of canonical vendor slugs accepted by ingest.record.
           Vendor identity is defined in config/vendor_aliases.json.

METER: list of (slug, connector_fn) pairs.
"""

from ..aliases import VENDOR_ALIASES

CANONICAL: frozenset = frozenset(VENDOR_ALIASES.keys())

from .vendors import deepinfra as _deepinfra
from .vendors import ovh as _ovh
from .vendors import vast as _vast
from .vendors import fireworks as _fw
from .vendors import openai_ as _openai

from .vendors import aws as _aws
from .vendors import gcp as _gcp

METER: list = [
    ("deepinfra", _deepinfra.meter),
    ("vast.ai", _vast.meter),
    ("ovhcloud", _ovh.meter),
    ("fireworks", _fw.meter),
    ("aws", _aws.meter),
    ("google", _gcp.meter),
    ("openai", _openai.meter),
]
