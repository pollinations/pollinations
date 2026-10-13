#!/usr/bin/env python3
"""Read one public HTTPS page for the isolated model-management researcher."""

import hashlib
import ipaddress
import json
import os
import re
import socket
import sys
from html.parser import HTMLParser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urljoin, urlsplit, urlunsplit


EXTRACTION_VERSION = 2
MAX_CHARACTERS = 18_000
MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
SENSITIVE_QUERY_NAMES = {"access_key", "access_token", "api_key", "apikey", "auth", "authorization", "bearer", "client_secret", "credential", "key", "password", "secret", "signature", "sig", "token"}


class ValidationError(ValueError):
    pass


def _public_addresses(host):
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValidationError("url host could not be resolved") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValidationError("url host must resolve only to public IP addresses")
    return sorted(addresses)


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0
        self.table = None
        self.row = None
        self.cell = None
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "template"}:
            self.ignored += 1
        elif not self.ignored:
            if tag == "table":
                self.table = {"rows": [], "simple": True}
            elif self.table is not None and tag == "tr":
                self.row = []
            elif self.row is not None and tag in {"th", "td"}:
                self.cell = []
                if any(name in {"colspan", "rowspan"} and value != "1" for name, value in attrs):
                    self.table["simple"] = False
            elif self.cell is None and re.fullmatch("h[1-6]", tag):
                self.heading = (tag, [])
            elif tag in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"}:
                target = self.cell if self.cell is not None else self.heading[1] if self.heading else self.parts
                target.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "template"} and self.ignored:
            self.ignored -= 1
        elif not self.ignored:
            if tag in {"th", "td"} and self.cell is not None:
                value = " ".join("".join(self.cell).split()).replace("|", "&#124;")
                self.row.append((value, tag == "th"))
                self.cell = None
            elif tag == "tr" and self.row is not None:
                if self.row:
                    self.table["rows"].append(self.row)
                self.row = None
            elif tag == "table" and self.table is not None:
                rows = self.table["rows"]
                self.parts.append("\n")
                for index, row in enumerate(rows):
                    self.parts.append("| " + " | ".join(value for value, _ in row) + " |\n")
                    # Spanned headers cannot safely bind a price to a column.
                    if index == 0 and self.table["simple"] and all(header for _, header in row):
                        self.parts.append("| " + " | ".join("---" for _ in row) + " |\n")
                self.table = None
            elif self.heading and tag == self.heading[0]:
                self.parts.append("\n" + "#" * int(tag[1]) + " " + " ".join("".join(self.heading[1]).split()) + "\n")
                self.heading = None
            elif tag in {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"}:
                (self.cell if self.cell is not None else self.heading[1] if self.heading else self.parts).append("\n")

    def handle_data(self, data):
        if not self.ignored:
            (self.cell if self.cell is not None else self.heading[1] if self.heading else self.parts).append(data)

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
        raise ValidationError("url must be a public HTTPS URL")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValidationError("url must be a public HTTPS URL")
    if any(_is_sensitive_query_name(name) for name, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        raise ValidationError("url must not include credential-bearing query parameters")
    if parsed.port not in (None, 443):
        raise ValidationError("url must use HTTPS port 443")
    _public_addresses(parsed.hostname)
    return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, ""))


def _page_html(page):
    content = getattr(page, "html_content", None)
    if isinstance(content, str):
        return content
    body = getattr(page, "body", b"")
    if isinstance(body, bytes):
        return body.decode(getattr(page, "encoding", None) or "utf-8", errors="replace")
    return body if isinstance(body, str) else ""


def _excerpt(page, max_characters, focus, cached):
    text = page["text"]
    start = 0
    metadata = {}
    if focus is not None:
        match = re.search(re.escape(focus), text, re.IGNORECASE)
        if match:
            context = min(2_000, max(0, max_characters - len(match.group())))
            start = max(0, match.start() - context)
        metadata = {"excerptStart": start, "totalCharacters": len(text), "focusMatched": match is not None}
    return {
        "status": "fetched", "url": page["url"], "method": "scrapling-http",
        "text": text[start:start + max_characters],
        "pageDigest": page["pageDigest"], "extractionVersion": page["extractionVersion"],
        "fetchedAt": page["fetchedAt"], "cached": cached, **metadata,
    }


def _read_http(url, max_characters, focus=None):
    current = _validate_url(url)
    requested = current
    cache_dir = os.environ.get("FETCH_CACHE_DIR")
    cache_path = Path(cache_dir) / (hashlib.sha256(requested.encode("utf-8")).hexdigest() + ".json") if cache_dir else None
    if cache_path and cache_path.exists():
        try:
            with cache_path.open("rb") as handle:
                content = handle.read(MAX_RESPONSE_BYTES * 6 + 8_193)
            if len(content) > MAX_RESPONSE_BYTES * 6 + 8_192:
                raise ValueError("oversized cache entry")
            page = json.loads(content)
            text = page["text"]
            if (page["requestedUrl"] != requested or type(page["extractionVersion"]) is not int
                    or page["extractionVersion"] not in (1, EXTRACTION_VERSION) or not isinstance(text, str) or not text.strip()
                    or len(text.encode("utf-8")) > MAX_RESPONSE_BYTES
                    or page["pageDigest"] != hashlib.sha256(text.encode("utf-8")).hexdigest()
                    or not isinstance(page["fetchedAt"], str) or not page["fetchedAt"].endswith("Z")):
                raise ValueError("invalid cache entry")
            datetime.fromisoformat(page["fetchedAt"].replace("Z", "+00:00"))
            page["url"] = _validate_url(page["url"])
        except Exception as error:
            raise ValidationError("cached page failed validation") from error
        if page["extractionVersion"] == EXTRACTION_VERSION:
            return _excerpt(page, max_characters, focus, True)

    from curl_cffi import CurlOpt
    from scrapling.fetchers import FetcherSession

    for _ in range(MAX_REDIRECTS + 1):
        host = urlsplit(current).hostname
        addresses = _public_addresses(host)
        resolved = ",".join(f"[{address}]" if ":" in address else address for address in addresses)
        with FetcherSession() as session:
            # Pinned Scrapling 0.4.15 has no public transport-options hook.
            session._curl_session.curl_options = {CurlOpt.RESOLVE: [f"{host}:443:{resolved}"], CurlOpt.MAXFILESIZE_LARGE: MAX_RESPONSE_BYTES}
            session._curl_session.trust_env = False
            page = session.get(current, follow_redirects=False, timeout=20, retries=0)
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
        content = _page_html(page)
        if len(content.encode("utf-8")) > MAX_RESPONSE_BYTES:
            return _result(current, "scrapling-http", "upstream content exceeded the fetch limit")
        parser = _TextParser()
        parser.feed(content)
        parser.close()
        text = parser.text()
        if not text.strip():
            return _result(current, "scrapling-http", "upstream returned no readable content")
        if len(text.encode("utf-8")) > MAX_RESPONSE_BYTES:
            return _result(current, "scrapling-http", "extracted content exceeded the fetch limit")
        page = {
            "requestedUrl": requested, "url": current, "text": text,
            "pageDigest": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "extractionVersion": EXTRACTION_VERSION,
            "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
        return _excerpt(page, max_characters, focus, False)
    return _result(current, "scrapling-http", "too many redirects")


def main():
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValidationError("request must be a JSON object")
        url = request.get("url")
        mode = request.get("mode", "http")
        max_characters = request.get("maxCharacters", MAX_CHARACTERS)
        focus = request.get("focus")
        if "focus" in request and (not isinstance(focus, str) or not focus.strip() or len(focus) > 200):
            raise ValidationError("focus must be a nonempty string of at most 200 characters")
        if mode not in {"http", "dynamic"}:
            raise ValidationError("mode must be http or dynamic")
        if not isinstance(max_characters, int) or isinstance(max_characters, bool) or not 1 <= max_characters <= MAX_CHARACTERS:
            raise ValidationError(f"maxCharacters must be an integer from 1 to {MAX_CHARACTERS}")
        url = _validate_url(url)
        if mode == "dynamic":
            # Scrapling's DynamicFetcher has no documented per-request DNS/IP policy hook.
            return _result(url, "scrapling-dynamic", "dynamic mode is unavailable because browser subrequests cannot be safely validated")
        return _read_http(url, max_characters, focus)
    except ValidationError as error:
        return _result(_safe_url(locals().get("url", "")), "scrapling-http", str(error))
    except Exception:
        return _result(_safe_url(locals().get("url", "")), "scrapling-http", "HTTP fetch failed")


if __name__ == "__main__":
    print(json.dumps(main()))
