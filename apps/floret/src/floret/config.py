from __future__ import annotations

import contextvars
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_api_key_override: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "api_key_override", default=None
)


def _current_api_key() -> str | None:
    return _api_key_override.get()


class Settings(BaseSettings):
    # POLLI_-prefixed env vars are the documented convention (see .env.example);
    # openai_* fields deliberately stay unprefixed to match the OpenAI SDK's
    # own OPENAI_API_KEY/OPENAI_BASE_URL convention.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_base_url: str = "https://gen.pollinations.ai"
    openai_api_key: str = ""
    default_tier: str = Field("balanced", validation_alias="POLLI_TIER")
    max_concurrency: int = Field(4, validation_alias="POLLI_MAX_CONCURRENCY")
    temp_dir: str = Field("tmp", validation_alias="POLLI_TEMP_DIR")
    brain_model: str = Field("glm", validation_alias="POLLI_BRAIN_MODEL")
    # Safety backstop only — loop detection injects corrective guidance long
    # before this; the cap just prevents a truly runaway loop from burning quota.
    max_iters: int = Field(100, validation_alias="POLLI_MAX_ITERS")
    default_voice: str = Field("nova", validation_alias="POLLI_DEFAULT_VOICE")
    public_base_url: str = Field("", validation_alias="POLLI_PUBLIC_BASE_URL")
    paid: bool = Field(True, validation_alias="POLLI_PAID")
    sse_keepalive_seconds: float = Field(
        15.0, validation_alias="POLLI_SSE_KEEPALIVE_SECONDS"
    )
    brain_timeout_seconds: float = Field(
        180.0, validation_alias="POLLI_BRAIN_TIMEOUT_SECONDS"
    )
    # Local/dev convenience only. When false (the default) a request without a
    # per-request credential fails instead of silently spending the operator's
    # own key — which for a hosted deployment is the whole point.
    allow_operator_key: bool = Field(
        False, validation_alias="POLLI_ALLOW_OPERATOR_KEY"
    )


settings = Settings()


def resolve_api_key() -> str:
    """The credential this request may spend.

    Normally the per-request token the gateway passed in — with run tokens that
    is a short-lived `ag_` credential scoped to the calling user, so the agent
    never holds anyone's long-lived key. Falls back to the operator's own key
    only when `POLLI_ALLOW_OPERATOR_KEY` is set.
    """
    key = _current_api_key()
    if key:
        return key
    return settings.openai_api_key if settings.allow_operator_key else ""
