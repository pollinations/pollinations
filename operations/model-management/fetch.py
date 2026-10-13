#!/usr/bin/env python3
"""Read one public HTTPS page for the isolated model-management researcher."""

import hashlib
import ipaddress
import json
import math
import os
import re
import socket
import sys
import tempfile
import time
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qsl, urljoin, urlsplit, urlunsplit
from xml.etree import ElementTree


EXTRACTION_VERSION = 2
MAX_CHARACTERS = 18_000
MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_HTTP_ATTEMPTS = 3
HTTP_DEADLINE_SECONDS = 80
MAX_BROWSER_REQUESTS = 64
MAX_BROWSER_BYTES = 8 * 1024 * 1024
RETRYABLE_CURL_CODES = {6, 7, 18, 28, 52, 55, 56, 81, 89, 92, 95, 96}
SENSITIVE_QUERY_NAMES = {"access_key", "access_token", "api_key", "apikey", "auth", "authorization", "bearer", "client_secret", "credential", "key", "password", "secret", "signature", "sig", "token"}


class ValidationError(ValueError):
    pass


def _public_addresses(host, deadline=None):
    attempts = MAX_HTTP_ATTEMPTS if deadline is not None else 1
    for attempt in range(attempts):
        try:
            addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
            break
        except socket.gaierror as error:
            if error.errno != socket.EAI_AGAIN or attempt == attempts - 1:
                raise ValidationError("url host could not be resolved") from error
            delay = 2 ** (attempt + 1)
            if delay >= deadline - time.monotonic():
                raise ValidationError("url host could not be resolved") from error
            time.sleep(delay)
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
        self.links = []
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "template"}:
            self.ignored += 1
        elif not self.ignored:
            if tag == "a" and len(self.links) < 100:
                href = dict(attrs).get("href", "")
                self.anchor = (href, []) if isinstance(href, str) and len(href) <= 2048 else None
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
            if tag == "a" and self.anchor:
                self.links.append({"href": self.anchor[0], "text": " ".join("".join(self.anchor[1]).split())[:300]})
                self.anchor = None
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
            if self.anchor and sum(map(len, self.anchor[1])) < 1000:
                self.anchor[1].append(data[:1000])
            (self.cell if self.cell is not None else self.heading[1] if self.heading else self.parts).append(data)

    def text(self):
        return "\n".join(line.strip() for line in "".join(self.parts).splitlines() if line.strip())


def _source_links(url, anchors):
    links = []
    seen = {url}
    for anchor in anchors:
        try:
            target = urlsplit(urljoin(url, anchor["href"]))
            if target.port not in (None, 443):
                continue
        except ValueError:
            continue
        if (target.scheme != "https" or not target.hostname or target.username or target.password
                or any(_is_sensitive_query_name(key) for key, _ in parse_qsl(target.query))):
            continue
        try:
            address = ipaddress.ip_address(target.hostname)
            if not address.is_global:
                continue
        except ValueError:
            pass
        value = target._replace(fragment="").geturl()
        if value in seen or not re.search(r"model|pricing|inference|release|checkpoint|github|huggingface|provider|serverless", value + " " + anchor["text"], re.I):
            continue
        seen.add(value)
        links.append({"url": value, "text": anchor["text"]})
        if len(links) == 12:
            break
    return links

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


def _validate_url(value, deadline=None):
    if not isinstance(value, str) or len(value) > 2_048:
        raise ValidationError("url must be a public HTTPS URL")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValidationError("url must be a public HTTPS URL")
    if any(_is_sensitive_query_name(name) for name, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        raise ValidationError("url must not include credential-bearing query parameters")
    if parsed.port not in (None, 443):
        raise ValidationError("url must use HTTPS port 443")
    _public_addresses(parsed.hostname, deadline)
    return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, ""))


def _page_html(page):
    content = getattr(page, "html_content", None)
    if isinstance(content, str):
        return content
    body = getattr(page, "body", b"")
    if isinstance(body, bytes):
        return body.decode(getattr(page, "encoding", None) or "utf-8", errors="replace")
    return body if isinstance(body, str) else ""


def _retry_delay(headers, attempt):
    value = headers.get("retry-after") if hasattr(headers, "get") else None
    if value is None and hasattr(headers, "get"):
        value = headers.get("Retry-After")
    try:
        delay = float(value)
    except (TypeError, ValueError):
        try:
            delay = (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()
        except (TypeError, ValueError, OverflowError):
            delay = 0
    if delay > 30:
        return None
    return max(2 ** (attempt + 1), delay)


def _retryable_network_error(error):
    code = getattr(error, "code", None)
    return (isinstance(error, (TimeoutError, ConnectionError)) or code in RETRYABLE_CURL_CODES
            or (type(error).__name__ == "TimeoutError" and type(error).__module__.startswith(("playwright.", "patchright."))))


_reddit_next_request = 0


def _reddit_feed_slot(url, deadline):
    global _reddit_next_request
    if urlsplit(url).hostname not in {"reddit.com", "www.reddit.com", "old.reddit.com"} or not urlsplit(url).path.endswith(".rss"):
        return
    directory = os.environ.get("FETCH_CACHE_DIR")
    clock = Path(directory) / "reddit-rate-limit.json" if directory else None
    lock = Path(directory) / "reddit-rate-limit.lock" if directory else None
    acquired = False
    try:
        if clock:
            clock.parent.mkdir(parents=True, exist_ok=True)
            try:
                with lock.open("x", encoding="utf-8"):
                    pass
                acquired = True
            except FileExistsError as error:
                raise ValidationError("another Reddit feed request is being scheduled") from error
            if clock.exists():
                try:
                    next_request = json.loads(clock.read_text(encoding="utf-8"))["notBefore"]
                    if not isinstance(next_request, (float, int)) or isinstance(next_request, bool) or not math.isfinite(next_request) or next_request < 0 or next_request > time.time() + 3600:
                        raise ValueError("invalid rate limit clock")
                except (ValueError, KeyError, TypeError) as error:
                    raise ValidationError("Reddit rate limit clock failed validation") from error
            else:
                next_request = 0
        else:
            next_request = _reddit_next_request
        delay = max(0, next_request - time.time())
        if delay + 1 >= deadline - time.monotonic():
            raise ValidationError("Reddit public feed rate limit exceeds this fetch deadline")
        _reddit_next_request = max(time.time(), next_request) + 61
        if clock:
            temporary = clock.with_suffix(f".{os.getpid()}.tmp")
            temporary.write_text(json.dumps({"notBefore": _reddit_next_request}), encoding="utf-8")
            temporary.replace(clock)
    finally:
        if acquired:
            lock.unlink()
    if delay:
        time.sleep(delay)


def _pinned_fetch(url, deadline, method="GET", headers=None, raw=False, byte_limit=MAX_RESPONSE_BYTES, remaining=None, on_bytes=None):
    from curl_cffi import CurlOpt
    from scrapling.fetchers import FetcherSession

    remaining = deadline - time.monotonic() if remaining is None else remaining
    if remaining <= 0:
        raise ValidationError("fetch deadline exceeded")
    _reddit_feed_slot(url, deadline)
    host = urlsplit(url).hostname.encode("idna").decode("ascii")
    addresses = _public_addresses(host, deadline)
    resolved = ",".join(f"[{address}]" if ":" in address else address for address in addresses)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValidationError("fetch deadline exceeded")
    with FetcherSession() as session:
        # Pinned Scrapling 0.4.15 has no public transport-options hook.
        session._curl_session.curl_options = {CurlOpt.RESOLVE: [f"{host}:443:{resolved}"], CurlOpt.MAXFILESIZE_LARGE: byte_limit,
                                             CurlOpt.PROXY: ""}
        session._curl_session.trust_env = False
        if not raw:
            feed_request = urlsplit(url).hostname in {"reddit.com", "www.reddit.com", "old.reddit.com"} and urlsplit(url).path.endswith(".rss")
            options = {"stealthy_headers": False, "impersonate": None, "headers": {"User-Agent": "PollinationsModelResearch/1.0 (+https://github.com/pollinations/pollinations/issues/16544)", "Accept": "application/atom+xml, application/rss+xml, application/xml;q=0.9"}} if feed_request else {}
            page = session.get(url, follow_redirects=False, timeout=min(20, remaining), retries=0, **options)
            if time.monotonic() >= deadline:
                raise ValidationError("fetch deadline exceeded")
            return page
        chunks = []
        size = 0

        def receive(chunk):
            nonlocal size
            if on_bytes:
                on_bytes(len(chunk))
            size += len(chunk)
            if size > byte_limit or time.monotonic() >= deadline:
                raise ValidationError("browser response exceeded the fetch limit")
            chunks.append(chunk)

        response = session._curl_session.request(
            method, url=url, headers=headers or {}, allow_redirects=False,
            timeout=min(20, remaining), verify=True, impersonate="chrome",
            content_callback=receive,
        )
        if time.monotonic() >= deadline:
            raise ValidationError("fetch deadline exceeded")
        return SimpleNamespace(status=response.status_code, headers=dict(response.headers), body=b"".join(chunks))


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
        "status": "fetched", "url": page["url"], "method": page.get("method", "scrapling-http"),
        "text": text[start:start + max_characters],
        "pageDigest": page["pageDigest"], "extractionVersion": page["extractionVersion"],
        "fetchedAt": page["fetchedAt"], "cached": cached, **metadata,
        "links": page.get("links", []),
    }


def _feed_text(content, url):
    content = content.lstrip("\ufeff")
    if not re.match(r"\s*(?:<\?xml\b|<(?:feed|rss)\b)", content):
        return None
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", content, re.I):
        raise ValidationError("feed declarations are not allowed")
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as error:
        raise ValidationError("feed could not be parsed") from error
    kind = root.tag.rsplit("}", 1)[-1]
    if kind not in {"feed", "rss"}:
        return None
    entries = root.findall("{*}entry") if kind == "feed" else root.findall("./channel/item")
    if not entries:
        raise ValidationError("feed contains no entries")
    parts, links = [], []
    for entry in entries:
        title = entry.findtext("{*}title", default="")
        published = entry.findtext("{*}published") or entry.findtext("{*}pubDate")
        updated = entry.findtext("{*}updated")
        link = next((item.get("href") for item in entry.findall("{*}link") if item.get("href") and item.get("rel", "alternate") == "alternate"), None) or entry.findtext("{*}link")
        body = entry.findtext("{*}content") or entry.findtext("{*}description") or entry.findtext("{*}summary") or ""
        parser = _TextParser()
        parser.feed(body)
        parser.close()
        parts.append("\n".join(item for item in [f"# {title}", f"Published: {published}" if published else "", f"Updated: {updated}" if updated else "", f"URL: {link}" if link else "", parser.text()] if item))
        if link:
            target = urlsplit(urljoin(url, link))
            if target.hostname in {"reddit.com", "www.reddit.com", "old.reddit.com"} and "/comments/" in target.path:
                link = urlunsplit((target.scheme, target.netloc, target.path.rstrip("/") + "/.rss", target.query, ""))
            links.append({"href": link, "text": title})
        links.extend(parser.links)
    return "\n\n".join(parts), links


def _read_http(url, max_characters, focus=None, include_links=False):
    deadline = time.monotonic() + HTTP_DEADLINE_SECONDS
    current = _validate_url(url, deadline)
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
                    or page.get("method", "scrapling-http") != "scrapling-http"
                    or page["extractionVersion"] not in (1, EXTRACTION_VERSION) or not isinstance(text, str) or not text.strip()
                    or len(text.encode("utf-8")) > MAX_RESPONSE_BYTES or _blocked_content("", text)
                    or page["pageDigest"] != hashlib.sha256(text.encode("utf-8")).hexdigest()
                    or not isinstance(page["fetchedAt"], str) or not page["fetchedAt"].endswith("Z")):
                raise ValueError("invalid cache entry")
            datetime.fromisoformat(page["fetchedAt"].replace("Z", "+00:00"))
            page["url"] = _validate_url(page["url"], deadline)
        except Exception as error:
            raise ValidationError("cached page failed validation") from error
        if page["extractionVersion"] == EXTRACTION_VERSION and (not include_links or "links" in page):
            return _excerpt(page, max_characters, focus, True)

    for _ in range(MAX_REDIRECTS + 1):
        for attempt in range(MAX_HTTP_ATTEMPTS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return _result(current, "scrapling-http", "HTTP fetch failed")
            try:
                page = _pinned_fetch(current, deadline, remaining=remaining)
                status = int(getattr(page, "status", 0))
                headers = getattr(page, "headers", {})
                retryable = status in {408, 429} or 500 <= status < 600
            except OSError as error:
                if not _retryable_network_error(error) or attempt == MAX_HTTP_ATTEMPTS - 1:
                    return _result(current, "scrapling-http", "HTTP fetch failed")
                retryable = True
                headers = {}
            if not retryable or attempt == MAX_HTTP_ATTEMPTS - 1:
                break
            delay = _retry_delay(headers, attempt)
            if delay is None:
                break
            if delay >= deadline - time.monotonic():
                return _result(current, "scrapling-http", "HTTP fetch failed")
            time.sleep(delay)
        if status in {301, 302, 303, 307, 308}:
            location = headers.get("location") if hasattr(headers, "get") else None
            if not location:
                return _result(current, "scrapling-http", "redirect response did not include a location")
            current = _validate_url(urljoin(current, location), deadline)
            continue
        if not 200 <= status < 300:
            return _result(current, "scrapling-http", f"upstream returned HTTP {status}")
        content = _page_html(page)
        if "xml" in str(headers.get("content-type", headers.get("Content-Type", ""))).lower() and isinstance(getattr(page, "body", None), bytes):
            content = page.body.decode("utf-8", errors="replace")
        if len(content.encode("utf-8")) > MAX_RESPONSE_BYTES:
            return _result(current, "scrapling-http", "upstream content exceeded the fetch limit")
        feed = _feed_text(content, current)
        if feed:
            text, links = feed
        else:
            parser = _TextParser()
            parser.feed(content)
            parser.close()
            text, links = parser.text(), parser.links
        if not text.strip():
            return _result(current, "scrapling-http", "upstream returned no readable content")
        if _blocked_content(content, text):
            return _result(current, "scrapling-http", "upstream returned a challenge or login screen")
        if len(text.encode("utf-8")) > MAX_RESPONSE_BYTES:
            return _result(current, "scrapling-http", "extracted content exceeded the fetch limit")
        page = {
            "requestedUrl": requested, "url": current, "text": text,
            "pageDigest": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "extractionVersion": EXTRACTION_VERSION,
            "links": _source_links(current, links),
            "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
        return _excerpt(page, max_characters, focus, False)
    return _result(current, "scrapling-http", "too many redirects")


def _blocked_content(content, text):
    # Reject interstitials, not documentation that merely discusses authentication.
    title = re.search(r"<title[^>]*>(.*?)</title>", content, re.I | re.S)
    title = " ".join((title.group(1) if title else text.splitlines()[0] if text else "").split()).lower().replace("…", "...")
    if title in {"just a moment...", "attention required! | cloudflare", "verify you are human", "access denied", "verifying your browser...", "making sure you're not a bot!"}:
        return True
    if re.search(r"<(?:input|form)\b[^>]*(?:type\s*=\s*['\"]password['\"]|action\s*=\s*['\"][^'\"]*(?:login|signin))", content, re.I) and len(text) < 2_000:
        return True
    return len(text) < 1_000 and bool(re.search(r"(?:checking your browser|enable javascript and cookies to continue|verify you are human|please sign in to continue|sign in to view this page)", text, re.I))


class _BrowserGuard:
    def __init__(self, deadline):
        self.deadline = deadline
        self.requests = 0
        self.bytes = 0
        self.setup_complete = False
        self.error = None
        self.retryable = False
        self.document_url = None
        self.preloaded = None

    def fetch(self, url, method="GET", headers=None):
        if time.monotonic() >= self.deadline:
            raise ValidationError("browser fetch deadline exceeded")
        if method not in {"GET", "HEAD"}:
            raise ValidationError("browser request method is not allowed")
        if self.requests >= MAX_BROWSER_REQUESTS or self.bytes >= MAX_BROWSER_BYTES:
            raise ValidationError("browser request or byte limit exceeded")
        current = _validate_url(url, self.deadline)
        for _ in range(MAX_REDIRECTS + 1):
            if self.requests >= MAX_BROWSER_REQUESTS or self.bytes >= MAX_BROWSER_BYTES:
                raise ValidationError("browser request or byte limit exceeded")
            self.requests += 1
            response = _pinned_fetch(current, self.deadline, method, headers, raw=True,
                                     byte_limit=min(MAX_RESPONSE_BYTES, MAX_BROWSER_BYTES - self.bytes), on_bytes=self.received)
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("location") or response.headers.get("Location")
                if not location:
                    raise ValidationError("redirect response did not include a location")
                current = _validate_url(urljoin(current, location), self.deadline)
                continue
            return current, response
        raise ValidationError("too many redirects")

    def received(self, size):
        self.bytes += size
        if self.bytes > MAX_BROWSER_BYTES:
            raise ValidationError("browser byte limit exceeded")

    def route(self, route):
        try:
            request = route.request
            if self.requests >= MAX_BROWSER_REQUESTS:
                raise ValidationError("browser request limit exceeded")
            self.requests += 1
            if time.monotonic() >= self.deadline:
                raise ValidationError("browser fetch deadline exceeded")
            if request.method not in {"GET", "HEAD"}:
                raise ValidationError("browser request method is not allowed")
            url = _validate_url(request.url, self.deadline)
            if self.preloaded and url == self.document_url and request.is_navigation_request():
                final, response = self.preloaded
                self.preloaded = None
            else:
                headers = {key: value for key, value in request.headers.items()
                           if key.lower() in {"accept", "accept-language", "user-agent"}}
                final, response = self.fetch(url, request.method, headers)
            # Fulfillment cannot change the browser's origin or a module's base URL.
            if final != url:
                raise ValidationError("redirected browser resource cannot preserve its source URL")
            if request.is_navigation_request() and request.frame == request.frame.page.main_frame:
                self.document_url = final
            headers = {str(key): str(value) for key, value in response.headers.items()
                       if key.lower() not in {"content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"}}
            route.fulfill(status=response.status, headers=headers, body=response.body)
        except Exception as error:
            retryable = _retryable_network_error(error)
            if self.error is None or not retryable:
                self.error = str(error) if isinstance(error, ValidationError) else "browser resource fetch failed"
                self.retryable = retryable
            route.abort("blockedbyclient")

    def setup(self, page):
        context = page.context
        try:
            context.route("**/*", self.route)
            context.route_web_socket("**/*", lambda socket: socket.close())
            context.add_init_script("""(() => {
              for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel',
                                  'WebTransport', 'Worker', 'SharedWorker']) {
                Object.defineProperty(globalThis, name, {value: undefined, configurable: false, writable: false});
              }
            })();""")
            self.setup_complete = True
        except Exception:
            self.error = "browser egress guard setup failed"
            # Scrapling logs and swallows page_setup errors; closing prevents its goto.
            context.close()
            raise ValidationError(self.error)


def _read_browser(url, max_characters, focus=None, include_links=False):
    method = "scrapling-browser"
    deadline = time.monotonic() + HTTP_DEADLINE_SECONDS
    requested = _validate_url(url, deadline)
    cache_dir = os.environ.get("FETCH_CACHE_DIR")
    cache_path = Path(cache_dir) / (hashlib.sha256(("dynamic:" + requested).encode()).hexdigest() + ".json") if cache_dir else None
    if cache_path and cache_path.exists():
        try:
            with cache_path.open("rb") as handle:
                content = handle.read(MAX_RESPONSE_BYTES * 6 + 8_193)
            if len(content) > MAX_RESPONSE_BYTES * 6 + 8_192:
                raise ValueError("oversized cache entry")
            page = json.loads(content)
            text = page["text"]
            if (page["requestedUrl"] != requested or page["method"] != method
                    or type(page["extractionVersion"]) is not int or page["extractionVersion"] != EXTRACTION_VERSION
                    or not isinstance(text, str) or not text.strip() or len(text.encode()) > MAX_RESPONSE_BYTES or _blocked_content("", text)
                    or page["pageDigest"] != hashlib.sha256(text.encode()).hexdigest()
                    or not isinstance(page["fetchedAt"], str) or not page["fetchedAt"].endswith("Z")
                    or not isinstance(page["links"], list) or len(page["links"]) > 12):
                raise ValueError("invalid cache entry")
            datetime.fromisoformat(page["fetchedAt"].replace("Z", "+00:00"))
            page["url"] = _validate_url(page["url"], deadline)
            if _source_links(page["url"], [{"href": link["url"], "text": link["text"]} for link in page["links"]]) != page["links"]:
                raise ValueError("invalid cache links")
        except Exception as error:
            raise ValidationError("cached page failed validation") from error
        return _excerpt(page, max_characters, focus, True)

    from scrapling.fetchers import StealthyFetcher

    guard = _BrowserGuard(deadline)
    for attempt in range(MAX_HTTP_ATTEMPTS):
        try:
            final, initial = guard.fetch(requested)
            if not (200 <= initial.status < 300 or initial.status == 403):
                if initial.status in {408, 429} or 500 <= initial.status < 600:
                    delay = _retry_delay(initial.headers, attempt)
                    if attempt < MAX_HTTP_ATTEMPTS - 1 and delay is not None and delay < deadline - time.monotonic():
                        time.sleep(delay)
                        continue
                return _result(final, method, f"upstream returned HTTP {initial.status}")
            guard.document_url = final
            guard.preloaded = (final, initial)
            guard.setup_complete = False
            guard.error = None
            guard.retryable = False
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValidationError("browser fetch deadline exceeded")
            with tempfile.TemporaryDirectory(prefix="public-research-browser-") as profile:
                page = StealthyFetcher.fetch(
                    final, headless=True, page_setup=guard.setup, retries=1,
                    timeout=min(20_000, max(1, int(remaining * 1000))), wait=1_000,
                    network_idle=True, solve_cloudflare=False, google_search=False,
                    block_webrtc=True, user_data_dir=profile,
                    extra_flags=["--disable-quic", "--disable-background-networking",
                                 "--host-resolver-rules=MAP * ~NOTFOUND", "--no-proxy-server"],
                    additional_args={"service_workers": "block", "ignore_https_errors": False,
                                     "permissions": [], "accept_downloads": False,
                                     "timeout": min(20_000, max(1, int(remaining * 1000)))},
                )
            if guard.error and guard.retryable:
                raise ConnectionError("browser resource fetch failed")
            if not guard.setup_complete or guard.error:
                raise ValidationError(guard.error or "browser egress guard setup failed")
            current = _validate_url(page.url, deadline)
            if current != guard.document_url or time.monotonic() >= deadline:
                raise ValidationError("browser render source or deadline could not be verified")
            if not 200 <= int(page.status) < 300:
                return _result(current, method, f"upstream returned HTTP {page.status}")
            content = _page_html(page)
            if len(content.encode()) > MAX_RESPONSE_BYTES:
                raise ValidationError("browser content exceeded the fetch limit")
            parser = _TextParser()
            parser.feed(content)
            parser.close()
            text = parser.text()
            if not text.strip() or _blocked_content(content, text):
                return _result(current, method, "upstream returned a challenge, login, or no public readable content")
            if len(text.encode()) > MAX_RESPONSE_BYTES:
                raise ValidationError("extracted content exceeded the fetch limit")
            page = {"requestedUrl": requested, "url": current, "method": method, "text": text,
                    "pageDigest": hashlib.sha256(text.encode()).hexdigest(), "extractionVersion": EXTRACTION_VERSION,
                    "links": _source_links(current, parser.links),
                    "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
            if cache_path:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
            return _excerpt(page, max_characters, focus, False)
        except ValidationError:
            raise
        except Exception as error:
            if ((guard.error and not guard.retryable) or not (_retryable_network_error(error) or guard.retryable)
                    or attempt == MAX_HTTP_ATTEMPTS - 1):
                return _result(requested, method, guard.error or "browser fetch failed")
            delay = _retry_delay({}, attempt)
            if delay >= deadline - time.monotonic():
                break
            time.sleep(delay)
    return _result(requested, method, "browser fetch failed")


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
        include_links = request.get("includeLinks", False)
        if type(include_links) is not bool:
            raise ValidationError("includeLinks must be boolean")
        return (_read_browser if mode == "dynamic" else _read_http)(url, max_characters, focus, include_links)
    except ValidationError as error:
        return _result(_safe_url(locals().get("url", "")), "scrapling-browser" if locals().get("mode") == "dynamic" else "scrapling-http", str(error))
    except Exception:
        method = "scrapling-browser" if locals().get("mode") == "dynamic" else "scrapling-http"
        return _result(_safe_url(locals().get("url", "")), method, "browser fetch failed" if method == "scrapling-browser" else "HTTP fetch failed")


if __name__ == "__main__":
    print(json.dumps(main()))
