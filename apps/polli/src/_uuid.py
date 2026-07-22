"""Fast UUID via uuid-utils (Rust)."""

from uuid_utils import uuid4


def uuid4_hex() -> str:
    return uuid4().hex
