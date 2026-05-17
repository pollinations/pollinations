"""Fast URL parsing via ada-url (C, WHATWG spec)."""

from __future__ import annotations

from urllib.parse import (
    ParseResult,
    quote,  # noqa: F401 — ada-url has no quote equivalent
)
from urllib.parse import urljoin as _stdlib_join

from ada_url import URL as _AdaURL
from ada_url import join_url as _ada_join


def parse_url(url: str) -> ParseResult:
    try:
        parsed = _AdaURL(url)
        return ParseResult(
            scheme=parsed.protocol.rstrip(":"),
            netloc=parsed.host or "",
            path=parsed.pathname or "",
            params="",
            query=parsed.search.lstrip("?") if parsed.search else "",
            fragment=parsed.hash.lstrip("#") if parsed.hash else "",
        )
    except ValueError:
        from urllib.parse import urlparse

        return urlparse(url)


def join_url(base: str, path: str) -> str:
    try:
        return _ada_join(base, path)
    except ValueError:
        return _stdlib_join(base, path)
