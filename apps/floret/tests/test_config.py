"""Settings must actually read the POLLI_-prefixed env vars .env documents."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from floret.config import Settings


def test_polli_prefixed_env_vars_are_honored(monkeypatch):
    monkeypatch.setenv("POLLI_MAX_CONCURRENCY", "99")
    monkeypatch.setenv("POLLI_TIER", "fast")
    monkeypatch.setenv("POLLI_TEMP_DIR", "/custom")
    monkeypatch.setenv("POLLI_PAID", "false")

    s = Settings()

    assert s.max_concurrency == 99
    assert s.default_tier == "fast"
    assert s.temp_dir == "/custom"
    assert s.paid is False


def test_default_brain_and_environment_override(monkeypatch):
    monkeypatch.delenv("POLLI_BRAIN_MODEL", raising=False)
    assert Settings(_env_file=None).brain_model == "z-ai/glm-5.3-flash"

    monkeypatch.setenv("POLLI_BRAIN_MODEL", "custom-brain")
    assert Settings(_env_file=None).brain_model == "custom-brain"


def test_unprefixed_openai_vars_still_work(monkeypatch):
    """OPENAI_API_KEY/OPENAI_BASE_URL are the OpenAI SDK convention — keep unprefixed."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.com")

    s = Settings()

    assert s.openai_api_key == "sk-test"
    assert s.openai_base_url == "https://example.com"


@pytest.mark.parametrize(
    ("env_name", "value"),
    [
        ("POLLI_MAX_CONCURRENCY", "0"),
        ("POLLI_MAX_ITERS", "0"),
        ("POLLI_SSE_KEEPALIVE_SECONDS", "0"),
        ("POLLI_SSE_KEEPALIVE_SECONDS", "-1"),
        ("POLLI_BRAIN_TIMEOUT_SECONDS", "0"),
    ],
)
def test_positive_runtime_limits(monkeypatch, env_name, value):
    monkeypatch.setenv(env_name, value)

    with pytest.raises(ValidationError):
        Settings()
