"""Fast URL parsing: ada-url (C) → urllib.parse fallback."""

from __future__ import annotations

try:
    from urllib.parse import ParseResult
    from urllib.parse import urljoin as _stdlib_join
    from urllib.parse import urlparse as _stdlib_parse

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
            return _stdlib_parse(url)

    def join_url(base: str, path: str) -> str:
        try:
            return _ada_join(base, path)
        except ValueError:
            return _stdlib_join(base, path)

    def quote(string: str, safe: str = "/") -> str:
        # ada-url doesn't have a quote equivalent; fall back to urllib
        from urllib.parse import quote as _quote

        return _quote(string, safe=safe)

except ImportError:
    from urllib.parse import ParseResult, quote, urljoin, urlparse  # noqa: F401, F811

    def parse_url(url: str) -> ParseResult:  # type: ignore[misc]
        return urlparse(url)

    def join_url(base: str, path: str) -> str:  # type: ignore[misc]
        return urljoin(base, path)
