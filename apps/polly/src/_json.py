"""Fast JSON via orjson (Rust)."""

from __future__ import annotations

from typing import Any

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
