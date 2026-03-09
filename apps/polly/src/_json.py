"""Fast JSON: orjson (Rust) → stdlib json fallback."""

from __future__ import annotations

from typing import Any

try:
    import orjson

    def loads(data: str | bytes) -> Any:
        return orjson.loads(data)

    def dumps(obj: Any, **kwargs) -> str:
        option = 0
        if kwargs.get("indent"):
            option |= orjson.OPT_INDENT_2
        return orjson.dumps(obj, option=option or None).decode()

    def load_file(path: str) -> Any:
        with open(path, "rb") as f:
            return orjson.loads(f.read())

except ImportError:
    import json

    def loads(data: str | bytes) -> Any:  # type: ignore[misc]
        return json.loads(data)

    def dumps(obj: Any, **kwargs) -> str:  # type: ignore[misc]
        return json.dumps(obj, ensure_ascii=False, **kwargs)

    def load_file(path: str) -> Any:  # type: ignore[misc]
        with open(path) as f:
            return json.load(f)
