"""Connector tests. All hermetic — monkeypatch http_json, no network, no SOPS.
Run: cd apps/operation/forager && python3 -m pytest tests/test_connectors.py -q
"""
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.connectors import common
from ingest.connectors import registry


# ---------------------------------------------------------------------------
# http_json POST extension
# ---------------------------------------------------------------------------

def _cap_urlopen(monkeypatch):
    """Helper: patch urllib.request.urlopen to capture request objects.
    Returns the list that collects captured Request objects.
    json.load on the response object always returns {}.
    """
    import urllib.request as _ur
    _reqs = []

    class _CapResp:
        def __init__(self, r): _reqs.append(r)
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self): return b'{}'

    monkeypatch.setattr(_ur, "urlopen", lambda req, timeout=30: _CapResp(req))
    # Patch _json.load so it doesn't try to read from our fake response object
    monkeypatch.setattr(common._json, "load", lambda f: {})
    return _reqs


def test_http_json_get_backward_compatible(monkeypatch):
    """http_json(url) without data still fires a GET with UA."""
    _reqs = _cap_urlopen(monkeypatch)
    result = common.http_json("https://example.com/api")
    req = _reqs[0]
    assert req.get_method() == "GET"
    assert req.get_header("User-agent") == common.UA
    assert req.data is None


def test_http_json_post_with_data_dict(monkeypatch):
    """http_json(url, data=dict) sends POST with JSON body and Content-Type."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/api", data={"key": "value"})
    req = _reqs[0]
    assert req.get_method() == "POST"
    assert req.get_header("User-agent") == common.UA
    assert req.get_header("Content-type") == "application/json"
    body = json.loads(req.data.decode())
    assert body == {"key": "value"}


def test_http_json_post_explicit_method(monkeypatch):
    """http_json(url, method='POST') without data still sends POST (no body)."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/api", method="POST")
    req = _reqs[0]
    assert req.get_method() == "POST"


def test_http_json_post_bytes_data(monkeypatch):
    """http_json(url, data=bytes) sends raw bytes as body (POST)."""
    _reqs = _cap_urlopen(monkeypatch)
    raw = b'raw body bytes'
    common.http_json("https://example.com/api", data=raw)
    req = _reqs[0]
    assert req.data == raw
    assert req.get_method() == "POST"


def test_http_json_ua_always_set(monkeypatch):
    """UA header is set on both GET and POST requests."""
    _reqs = _cap_urlopen(monkeypatch)
    common.http_json("https://example.com/a")
    common.http_json("https://example.com/b", data={"x": 1})
    assert _reqs[0].get_header("User-agent") == common.UA
    assert _reqs[1].get_header("User-agent") == common.UA


# ---------------------------------------------------------------------------
# registry.CANONICAL includes all provider-column slugs
# ---------------------------------------------------------------------------

def test_canonical_contains_compute_slugs():
    """Compute and infra slugs must be in CANONICAL."""
    must_have = ["google", "aws", "openai", "vast.ai", "ovhcloud", "runpod", "scaleway"]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing compute slug: {slug}"


def test_canonical_contains_operating_provider_slugs():
    """Operating-expense slugs are canonical because provider is a cross-tab filter."""
    must_have = ["deel", "google-workspace", "slack", "wise", "self-issued"]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing ops slug: {slug}"
