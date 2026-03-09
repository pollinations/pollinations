"""Fast UUID: uuid-utils (Rust) → stdlib uuid fallback."""

try:
    from uuid_utils import uuid4

    def uuid4_hex() -> str:
        return uuid4().hex

except ImportError:
    from uuid import uuid4  # type: ignore[assignment]

    def uuid4_hex() -> str:  # type: ignore[misc]
        return uuid4().hex
