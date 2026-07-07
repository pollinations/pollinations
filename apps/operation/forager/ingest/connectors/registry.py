"""Connector registry.

CANONICAL: full set of canonical vendor slugs accepted by ingest.record.
           Vendor identity is defined in config/vendor_aliases.json.

METER: list of (slug, connector_fn) pairs.
"""

from ..aliases import VENDOR_ALIASES

CANONICAL: frozenset = frozenset(VENDOR_ALIASES.keys())

from .vendors import alibaba as _alibaba
from .vendors import anthropic_ as _anthropic
from .vendors import azure as _azure
from .vendors import cloudflare as _cloudflare
from .vendors import community as _community
from .vendors import deepinfra as _deepinfra
from .vendors import elevenlabs as _elevenlabs
from .vendors import ovh as _ovh
from .vendors import vast as _vast
from .vendors import fireworks as _fw
from .vendors import openai_ as _openai
from .vendors import openrouter as _openrouter
from .vendors import runpod as _runpod
from .vendors import xai as _xai

from .vendors import gcp as _gcp

METER: list = [
    ("alibaba", _alibaba.meter),
    ("anthropic", _anthropic.meter),
    ("azure", _azure.meter),
    ("cloudflare", _cloudflare.meter),
    ("community", _community.meter),
    ("deepinfra", _deepinfra.meter),
    ("elevenlabs", _elevenlabs.meter),
    ("vast.ai", _vast.meter),
    ("ovhcloud", _ovh.meter),
    ("fireworks", _fw.meter),
    ("google", _gcp.meter),
    ("openai", _openai.meter),
    ("openrouter", _openrouter.meter),
    ("runpod", _runpod.meter),
    ("xai", _xai.meter),
]
