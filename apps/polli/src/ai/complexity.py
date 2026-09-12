"""Shared complexity routing for compatible text-generation tools."""

from __future__ import annotations

COMPLEXITY_MODELS = {
    "low": "openai/gpt-5.6-luna",
    "mid": "openai/gpt-5.6-terra",
    "high": "openai/gpt-5.6-sol",
}


def model_for_complexity(value: str | None, *, default: str = "high") -> str:
    """Return the configured model for a validated complexity enum."""
    if value is not None and value not in COMPLEXITY_MODELS:
        raise ValueError("complexity must be one of: low, mid, high")
    return COMPLEXITY_MODELS[value or default]
