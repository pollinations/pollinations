#!/usr/bin/env python3
"""Read one public HTTPS page for the isolated model-management researcher."""

import html
import ipaddress
import json
import socket
import sys
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urljoin, urlsplit, urlunsplit


MAX_CHARACTERS = 18_000
MAX_REDIRECTS = 5
SENSITIVE_QUERY_NAMES = {"access_key", "access_token", "api_key", "apikey", "auth", "authorization", "bearer", "client_secret", "credential", "key", "password", "secret", "signature", "sig", "token"}


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "template"}:
            self.ignored += 1
        elif tag in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "template"} and self.ignored:
            self.ignored -= 1
        elif tag in {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)

    def text(self):
        return "\n".join(line.strip() for line in "".join(self.parts).splitlines() if line.strip())


def _result(url, method, error):
    return {"status": "unavailable", "url": url, "method": method, "text": "", "error": error}


def _is_sensitive_query_name(name):
    name = name.lower().replace("-", "_")
    return name in SENSITIVE_QUERY_NAMES or name.endswith(("_key", "_password", "_secret", "_token"))


def _safe_url(value):
    if not isinstance(value, str):
        return ""
    try:
        parsed = urlsplit(value)
        if not parsed.hostname:
            return ""
        port = f":{parsed.port}" if parsed.port else ""
        query = "&".join(f"{name}={item}" for name, item in parse_qsl(parsed.query, keep_blank_values=True) if not _is_sensitive_query_name(name))
        return urlunsplit((parsed.scheme, f"{parsed.hostname}{port}", parsed.path or "/", query, ""))
    except ValueError:
        return ""


def _validate_url(value):
    if not isinstance(value, str) or len(value) > 2_048:
        raise ValueError("url must be a public HTTPS URL")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("url must be a public HTTPS URL")
    if any(_is_sensitive_query_name(name) for name, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        raise ValueError("url must not include credential-bearing query parameters")
    if parsed.port not in (None, 443):
        raise ValueError("url must use HTTPS port 443")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValueError("url host could not be resolved") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("url host must resolve only to public IP addresses")
    return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, ""))


def _page_html(page):
    content = getattr(page, "html_content", None)
    if isinstance(content, str):
        return content
    body = getattr(page, "body", b"")
    if isinstance(body, bytes):
        return body.decode(getattr(page, "encoding", None) or "utf-8", errors="replace")
    return str(body)


def _read_http(url, max_characters):
    from scrapling.fetchers import Fetcher

    current = _validate_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        page = Fetcher.get(current, follow_redirects=False, timeout=20, retries=0)
        status = int(getattr(page, "status", 0))
        headers = getattr(page, "headers", {})
        if status in {301, 302, 303, 307, 308}:
            location = headers.get("location") if hasattr(headers, "get") else None
            if not location:
                return _result(current, "scrapling-http", "redirect response did not include a location")
            current = _validate_url(urljoin(current, location))
            continue
        if not 200 <= status < 300:
            return _result(current, "scrapling-http", f"upstream returned HTTP {status}")
        parser = _TextParser()
        parser.feed(_page_html(page))
        parser.close()
        text = html.unescape(parser.text())[:max_characters]
        if not text.strip():
            return _result(current, "scrapling-http", "upstream returned no readable content")
        return {
            "status": "fetched",
            "url": current,
            "method": "scrapling-http",
            "text": text,
        }
    return _result(current, "scrapling-http", "too many redirects")


def main():
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("request must be a JSON object")
        url = request.get("url")
        mode = request.get("mode", "http")
        max_characters = request.get("maxCharacters", MAX_CHARACTERS)
        if mode not in {"http", "dynamic"}:
            raise ValueError("mode must be http or dynamic")
        if not isinstance(max_characters, int) or isinstance(max_characters, bool) or not 1 <= max_characters <= MAX_CHARACTERS:
            raise ValueError(f"maxCharacters must be an integer from 1 to {MAX_CHARACTERS}")
        url = _validate_url(url)
        if mode == "dynamic":
            # Scrapling's DynamicFetcher has no documented per-request DNS/IP policy hook.
            return _result(url, "scrapling-dynamic", "dynamic mode is unavailable because browser subrequests cannot be safely validated")
        return _read_http(url, max_characters)
    except ValueError as error:
        return _result(_safe_url(locals().get("url", "")), "scrapling-http", str(error))
    except Exception:
        return _result(_safe_url(locals().get("url", "")), "scrapling-http", "HTTP fetch failed")


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False))
