"""Connector registry.

CANONICAL: full set of canonical vendor slugs accepted by ingest.record.
           Vendor identity is defined in config/vendor_aliases.json.

METER: list of (slug, connector_fn) pairs.
"""

from ..aliases import VENDOR_ALIASES

CANONICAL: frozenset = frozenset(VENDOR_ALIASES.keys())

from .vendors import azure as _azure
from .vendors import deepinfra as _deepinfra
from .vendors import elevenlabs as _elevenlabs
from .vendors import ovh as _ovh
from .vendors import vast as _vast
from .vendors import fireworks as _fw
from .vendors import openai_ as _openai
from .vendors import openrouter as _openrouter
from .vendors import runpod as _runpod

from .vendors import gcp as _gcp

METER: list = [
    ("azure", _azure.meter),
    ("deepinfra", _deepinfra.meter),
    ("elevenlabs", _elevenlabs.meter),
    ("vast.ai", _vast.meter),
    ("ovhcloud", _ovh.meter),
    ("fireworks", _fw.meter),
    ("google", _gcp.meter),
    ("openai", _openai.meter),
    ("openrouter", _openrouter.meter),
    ("runpod", _runpod.meter),
]
