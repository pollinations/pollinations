import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adapter = fileURLToPath(new URL("./fetch.py", import.meta.url));
const python = process.env.PYTHON ?? "python";
// Only DNS and the external HTTP transport are fixtures; fetch.py stays real.
const harness = `
import importlib.util, io, json, socket, sys, types
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
case = json.load(sys.stdin)
if "monotonic" in case:
    times = iter(case["monotonic"])
    adapter.time.monotonic = lambda: next(times)
calls = []
sleeps = []
adapter.time.sleep = sleeps.append
def resolve(host, port, **kwargs):
    addresses = case.get("dns", {}).get(host, ["93.184.216.34"])
    return [(socket.AF_INET6 if ":" in address else socket.AF_INET,
             socket.SOCK_STREAM, 6, "", (address, port)) for address in addresses]
socket.getaddrinfo = resolve
class Fetcher:
    @staticmethod
    def get(url, **kwargs):
        calls.append({"url": url, "options": {key: str(value) for key, value in kwargs.items()}})
        item = case.get("pages", [{"status": 200, "html_content": "<p>Readable source</p>"}])[len(calls)-1]
        if "exception" in item:
            exceptions = {"value": ValueError, "timeout": TimeoutError, "os": OSError}
            raise exceptions.get(item.get("kind"), RuntimeError)(item["exception"])
        return types.SimpleNamespace(**item)
scrapling = types.ModuleType("scrapling")
fetchers = types.ModuleType("scrapling.fetchers")
fetchers.Fetcher = Fetcher
class FetcherSession:
    def __init__(self, **kwargs):
        self._curl_session = types.SimpleNamespace(curl_options={}, trust_env=True)
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def get(self, url, **kwargs):
        return Fetcher.get(url, **kwargs)
fetchers.FetcherSession = FetcherSession
curl = types.ModuleType("curl_cffi")
curl.CurlOpt = types.SimpleNamespace(RESOLVE=10203, MAXFILESIZE_LARGE=30117, PROXY=10004)
sys.modules["curl_cffi"] = curl
sys.modules["scrapling"] = scrapling
sys.modules["scrapling.fetchers"] = fetchers
sys.stdin = io.StringIO(json.dumps(case.get("request", {"url": "https://docs.example/"})))
result = adapter.main()
print(json.dumps({"result": result, "calls": calls, "sleeps": sleeps}))
`;

function run(overrides = {}, script = harness) {
    const child = spawnSync(python, ["-c", script, adapter], {
        input: JSON.stringify(overrides),
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    return JSON.parse(child.stdout);
}

const pinnedTransportHarness = `
import importlib.util, io, json, socket, sys, types
from curl_cffi import CurlOpt
from curl_cffi.requests import Session
from curl_cffi.requests.models import Response
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
calls = []
dns_calls = []
def resolve(host, port, **kwargs):
    dns_calls.append(host)
    addresses = ["93.184.216.34", "2606:4700:4700::1111"] if host == "docs.example" else ["1.1.1.1"]
    return [(socket.AF_INET6 if ":" in address else socket.AF_INET,
             socket.SOCK_STREAM, 6, "", (address, port)) for address in addresses]
socket.getaddrinfo = resolve
def request(self, method, **kwargs):
    calls.append({"url": kwargs["url"], "resolve": self.curl_options.get(CurlOpt.RESOLVE),
                  "max_response_bytes": self.curl_options.get(CurlOpt.MAXFILESIZE_LARGE),
                  "trust_env": self.trust_env, "proxy": self.curl_options.get(CurlOpt.PROXY), "redirects": kwargs.get("allow_redirects")})
    response = Response()
    response.url = kwargs["url"]
    response.status_code = 302 if len(calls) == 1 else 200
    response.reason = "Found" if len(calls) == 1 else "OK"
    response.encoding = "utf-8"
    response.content = b"<p>Actual Scrapling parser and session path</p>"
    response.headers = {"location": "https://next.example/final"} if len(calls) == 1 else {"content-type": "text/html"}
    response.cookies = {}
    response.request = None
    response.history = []
    return response
Session.request = request
sys.stdin = io.StringIO(json.dumps({"url": "https://docs.example/"}))
print(json.dumps({"result": adapter.main(), "calls": calls, "dns_calls": dns_calls}))
`;

test(
    "installed Scrapling pins every redirect connection and disables proxy environment",
    { skip: !process.env.PYTHONPATH && process.env.RUN_LIVE_FETCH !== "1" },
    () => {
        const { result, calls } = run({}, pinnedTransportHarness);
        assert.equal(result.status, "fetched", result.error);
        assert.equal(result.text, "Actual Scrapling parser and session path");
        assert.equal(calls.length, 2);
        for (const call of calls) {
            assert.equal(call.trust_env, false);
            assert.equal(call.proxy, "");
            assert.equal(call.redirects, false);
            assert.equal(call.max_response_bytes, 2 * 1024 * 1024);
            assert.ok(
                Array.isArray(call.resolve) && call.resolve.length > 0,
                "transport DNS must be pinned",
            );
        }
        assert.ok(
            calls[0].resolve.some(
                (entry) =>
                    entry.startsWith("docs.example:443:") &&
                    entry.includes("93.184.216.34") &&
                    entry.includes("2606:4700:4700::1111"),
            ),
        );
        assert.deepEqual(calls[1].resolve, ["next.example:443:1.1.1.1"]);
    },
);

test("mixed public and private DNS answers reject before transport", () => {
    for (const address of [
        "127.0.0.1",
        "10.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "169.254.1.1",
        "100.64.0.1",
        "192.0.2.1",
    ]) {
        const { result, calls } = run({
            dns: { "docs.example": ["93.184.216.34", address] },
        });
        assert.equal(result.status, "unavailable", address);
        assert.equal(calls.length, 0, address);
    }
});

test("private redirect is rejected without a second HTTP execution", () => {
    const { result, calls } = run({
        pages: [
            { status: 302, headers: { location: "https://private.example/" } },
        ],
        dns: { "private.example": ["192.168.1.1"] },
    });
    assert.equal(result.status, "unavailable");
    assert.equal(calls.length, 1);
});

test("redirect boundary also rejects insecure scheme, credentials, and port", () => {
    for (const location of [
        "http://docs.example/",
        "https://u:p@docs.example/",
        "https://docs.example:8443/",
        "https://docs.example/?api_key=fixture-value",
    ]) {
        const { result, calls } = run({
            pages: [{ status: 307, headers: { location } }],
        });
        assert.equal(result.status, "unavailable", location);
        assert.equal(calls.length, 1);
        assert.doesNotMatch(JSON.stringify(result), /fixture-value|u:p/);
    }
});

test("relative public redirect succeeds with manual redirect handling", () => {
    const { result, calls } = run({
        pages: [
            { status: 308, headers: { location: "/final" } },
            { status: 200, html_content: "<p>Final documentation</p>" },
        ],
    });
    assert.equal(result.status, "fetched");
    assert.equal(result.url, "https://docs.example/final");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.options.follow_redirects === "False"));
});

test("redirect cycle has a bounded number of HTTP executions", () => {
    const { result, calls } = run({
        pages: Array.from({ length: 8 }, () => ({
            status: 302,
            headers: { location: "/" },
        })),
    });
    assert.equal(result.status, "unavailable");
    assert.match(result.error, /redirect/i);
    assert.ok(calls.length <= 6);
});

test("transient HTTP failures retry three times with bounded incremental delays", () => {
    const { result, calls, sleeps } = run({
        pages: [
            { status: 503, headers: {} },
            { status: 429, headers: { "Retry-After": "7" } },
            { status: 200, html_content: "<p>Recovered documentation</p>" },
        ],
    });
    assert.equal(result.status, "fetched", result.error);
    assert.equal(result.text, "Recovered documentation");
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [2, 7]);

    const exhausted = run({
        pages: Array.from({ length: 3 }, () => ({ status: 503, headers: {} })),
    });
    assert.equal(exhausted.result.status, "unavailable");
    assert.equal(exhausted.calls.length, 3);
    assert.deepEqual(exhausted.sleeps, [2, 4]);
});

test("network timeouts retry but client and validation failures do not", () => {
    const recovered = run({
        pages: [
            { kind: "timeout", exception: "timed out" },
            { status: 200, html_content: "<p>Recovered</p>" },
        ],
    });
    assert.equal(recovered.result.status, "fetched", recovered.result.error);
    assert.equal(recovered.calls.length, 2);
    assert.deepEqual(recovered.sleeps, [2]);

    for (const status of [400, 401, 403, 404]) {
        const failed = run({ pages: [{ status, headers: {} }] });
        assert.equal(failed.result.status, "unavailable", status);
        assert.equal(failed.calls.length, 1, status);
        assert.deepEqual(failed.sleeps, [], status);
    }
    const invalid = run({ request: { url: "http://docs.example/" } });
    assert.equal(invalid.calls.length, 0);
    assert.deepEqual(invalid.sleeps, []);
});

test("Retry-After delays up to thirty seconds are honored", () => {
    const { result, calls, sleeps } = run({
        pages: [
            { status: 408, headers: { "retry-after": "30" } },
            { status: 200, html_content: "<p>Recovered</p>" },
        ],
    });
    assert.equal(result.status, "fetched", result.error);
    assert.equal(calls.length, 2);
    assert.deepEqual(sleeps, [30]);
});

test("the HTTP deadline prevents another attempt when its incremental wait cannot fit", () => {
    const { result, calls, sleeps } = run({
        monotonic: [0, 79, 79, 79, 79],
        pages: [{ status: 503, headers: {} }],
    });
    assert.equal(result.status, "unavailable");
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
});

test("HTML links retain bounded useful public leads without credentials or local targets", () => {
    const { result } = run({
        pages: [
            {
                status: 200,
                html_content:
                    '<h1>Model release</h1><a href="/models/novel-4">NovelModel 4</a><a href="https://huggingface.co/startup/novel-4">Model card</a><a href="https://127.0.0.1/models">Private model</a><a href="https://user:password@private.example/models">Credential model</a><a href="https://docs.example/models?api_key=test-secret">Pricing</a><a href="https://[bad/models">Bad link</a><script><a href="https://hidden.example/models">Hidden model</a></script><p>Current provider documentation remains readable</p>',
            },
        ],
    });
    assert.equal(result.status, "fetched", result.error);
    assert.deepEqual(result.links, [
        { url: "https://docs.example/models/novel-4", text: "NovelModel 4" },
        { url: "https://huggingface.co/startup/novel-4", text: "Model card" },
    ]);
    assert.match(result.text, /Current provider documentation/);
    assert.doesNotMatch(
        JSON.stringify(result.links),
        /password|test-secret|hidden|127\.0\.0\.1/,
    );
});

test("legacy no-link cache is refreshed for a crawl while ordinary saved reads remain reusable", () => {
    const setup = `import tempfile, hashlib, os\nfrom datetime import datetime, timezone\ncache = tempfile.TemporaryDirectory(); os.environ["FETCH_CACHE_DIR"] = cache.name\nlegacy = "Legacy current model documentation"\nurl = "https://docs.example/"\npage = {"requestedUrl":url,"url":url,"text":legacy,"pageDigest":hashlib.sha256(legacy.encode()).hexdigest(),"extractionVersion":2,"fetchedAt":datetime.now(timezone.utc).isoformat().replace("+00:00","Z")}\nfrom pathlib import Path\nPath(cache.name,hashlib.sha256(url.encode()).hexdigest()+".json").write_text(json.dumps(page))\n`;
    const script = harness.replace(
        "sys.stdin = io.StringIO",
        `${setup}sys.stdin = io.StringIO`,
    );
    const saved = run(
        { request: { url: "https://docs.example/", includeLinks: false } },
        script,
    );
    assert.equal(saved.calls.length, 0);
    assert.equal(saved.result.cached, true);
    const refreshed = run(
        {
            request: { url: "https://docs.example/", includeLinks: true },
            pages: [
                {
                    status: 200,
                    html_content:
                        '<p>Refreshed model documentation</p><a href="/models/new">New model</a>',
                },
            ],
        },
        script,
    );
    assert.equal(refreshed.calls.length, 1);
    assert.equal(refreshed.result.cached, false);
    assert.equal(
        refreshed.result.links[0].url,
        "https://docs.example/models/new",
    );
});

test("Retry-After beyond thirty seconds defers without retrying early", () => {
    for (const retryAfter of [
        "120",
        new Date(Date.now() + 120_000).toUTCString(),
    ]) {
        const { result, calls, sleeps } = run({
            pages: [{ status: 429, headers: { "Retry-After": retryAfter } }],
        });
        assert.equal(result.status, "unavailable");
        assert.match(result.error, /HTTP 429/);
        assert.equal(calls.length, 1);
        assert.deepEqual(sleeps, []);
    }
});

test("Retry-After HTTP dates are honored", () => {
    const retryAt = new Date(Date.now() + 10_000).toUTCString();
    const { result, calls, sleeps } = run({
        pages: [
            { status: 503, headers: { "Retry-After": retryAt } },
            { status: 200, html_content: "<p>Recovered</p>" },
        ],
    });
    assert.equal(result.status, "fetched", result.error);
    assert.equal(calls.length, 2);
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] >= 8 && sleeps[0] <= 10, sleeps[0]);
});

test("installed curl transport retries only transient error codes", () => {
    const script = `
import importlib.util, json, sys, types
from curl_cffi.const import CurlECode
from curl_cffi.requests.errors import RequestsError
spec = importlib.util.spec_from_file_location("fetch", sys.argv[1])
fetch = importlib.util.module_from_spec(spec); spec.loader.exec_module(fetch)
fetch._public_addresses = lambda host, *args: ["1.1.1.1"]
fetch.time.sleep = lambda delay: None
calls = []
class Session:
    def __init__(self): self._curl_session = types.SimpleNamespace()
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def get(self, *args, **kwargs):
        calls.append(mode)
        if mode == "timeout" and calls.count(mode) < 3:
            raise RequestsError("timeout", CurlECode.OPERATION_TIMEDOUT)
        if mode == "filesize":
            raise RequestsError("too large", CurlECode.FILESIZE_EXCEEDED)
        if mode == "certificate":
            raise RequestsError("bad certificate", CurlECode.SSL_CERTPROBLEM)
        return types.SimpleNamespace(status=200, headers={}, html_content="<p>Recovered</p>")
sys.modules["scrapling.fetchers"] = types.SimpleNamespace(FetcherSession=Session)
results = {}
for mode in ["timeout", "filesize", "certificate"]:
    before = len(calls)
    results[mode] = [fetch._read_http("https://example.com", 100), len(calls) - before]
print(json.dumps(results))
`;
    const child = spawnSync(python, ["-c", script, adapter], {
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    const results = JSON.parse(child.stdout);
    assert.equal(results.timeout[0].status, "fetched");
    assert.equal(results.timeout[1], 3);
    for (const name of ["filesize", "certificate"]) {
        assert.equal(results[name][0].status, "unavailable", name);
        assert.equal(results[name][1], 1, name);
    }
});

test("temporary DNS failures retry without weakening permanent or private-address rejection", () => {
    const script = `
import importlib.util, io, json, socket, sys, types
spec = importlib.util.spec_from_file_location("fetch", sys.argv[1])
fetch = importlib.util.module_from_spec(spec); spec.loader.exec_module(fetch)
sleeps = []
fetch.time.sleep = sleeps.append
dns = []
mode = "temporary"
def resolve(host, *args, **kwargs):
    dns.append(mode)
    count = dns.count(mode)
    if mode == "temporary" and count <= 2:
        raise socket.gaierror(socket.EAI_AGAIN, "temporary")
    if mode == "permanent":
        raise socket.gaierror(socket.EAI_NONAME, "permanent")
    if mode == "private":
        return [(None, None, None, None, ("127.0.0.1", 443))]
    return [(None, None, None, None, ("1.1.1.1", 443))]
fetch.socket.getaddrinfo = resolve
calls = []
class Session:
    def __init__(self): self._curl_session = types.SimpleNamespace()
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def get(self, *args, **kwargs):
        calls.append(mode)
        return types.SimpleNamespace(status=200, headers={}, html_content="<p>Fetched</p>")
sys.modules["curl_cffi"] = types.SimpleNamespace(CurlOpt=types.SimpleNamespace(RESOLVE=1, MAXFILESIZE_LARGE=2, PROXY=3))
sys.modules["scrapling.fetchers"] = types.SimpleNamespace(FetcherSession=Session)
results = {}
for mode in ["temporary", "permanent", "private"]:
    before_dns, before_calls, before_sleeps = len(dns), len(calls), len(sleeps)
    sys.stdin = io.StringIO(json.dumps({"url": "https://docs.example/"}))
    results[mode] = [fetch.main(), len(dns) - before_dns, len(calls) - before_calls, sleeps[before_sleeps:]]
print(json.dumps(results))
`;
    const child = spawnSync(python, ["-c", script, adapter], {
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    const results = JSON.parse(child.stdout);
    assert.equal(results.temporary[0].status, "fetched");
    assert.equal(results.temporary[1], 4);
    assert.equal(results.temporary[2], 1);
    assert.deepEqual(results.temporary[3], [2, 4]);
    for (const name of ["permanent", "private"]) {
        assert.equal(results[name][0].status, "unavailable", name);
        assert.equal(results[name][1], 1, name);
        assert.equal(results[name][2], 0, name);
        assert.deepEqual(results[name][3], [], name);
    }
});

test("upstream exception text never becomes public error text", () => {
    for (const kind of ["value", "runtime"]) {
        const { result } = run({
            pages: [
                {
                    kind,
                    exception:
                        "transport fixture credential: confidential-marker",
                },
            ],
        });
        assert.equal(result.status, "unavailable");
        assert.doesNotMatch(JSON.stringify(result), /confidential-marker/);
    }
});

test("missing or null content cannot be reported as fetched text", () => {
    for (const page of [
        { status: 200, body: null },
        { status: 200 },
        { status: 204, body: "" },
    ]) {
        const { result } = run({ pages: [page] });
        assert.equal(result.status, "unavailable");
        assert.equal(result.text, "");
    }
});

test("HTTP200 challenge and login screens cannot become evidence", () => {
    for (const html_content of [
        "<title>Just a moment...</title><p>Enable JavaScript and cookies to continue</p>",
        '<form action="/login"><input type="password"></form><p>Please sign in to continue</p>',
    ]) {
        const { result } = run({ pages: [{ status: 200, html_content }] });
        assert.equal(result.status, "unavailable");
        assert.match(result.error, /challenge|login/);
    }
});

test("Unicode survives HTML parsing and truncation by code point", () => {
    const { result } = run({
        request: { url: "https://docs.example/", maxCharacters: 4 },
        pages: [{ status: 200, html_content: "<p>🪴é中文tail</p>" }],
    });
    assert.equal(result.status, "fetched");
    assert.equal(result.text, "🪴é中文");
});

test("hidden script, style, template, and noscript text is excluded", () => {
    const { result } = run({
        pages: [
            {
                status: 200,
                html_content:
                    "<script>hidden-one</script><style>hidden-two</style><template><p>hidden-three</p></template><noscript>hidden-four</noscript><p>Visible documentation</p>",
            },
        ],
    });
    assert.equal(result.text, "Visible documentation");
});

test("HTML character references are decoded exactly once", () => {
    const { result } = run({
        pages: [
            {
                status: 200,
                html_content:
                    "<p>Literal &amp;lt;tag&amp;gt; and &amp;amp;</p>",
            },
        ],
    });
    assert.equal(result.text, "Literal &lt;tag&gt; and &amp;");
});

test("large readable responses have bounded returned text", () => {
    const { result } = run({
        request: { url: "https://docs.example/", maxCharacters: 31 },
        pages: [{ status: 200, html_content: `<p>${"x".repeat(200_000)}</p>` }],
    });
    assert.equal(result.status, "fetched");
    assert.equal(result.text, "x".repeat(31));
});

test("response byte limit rejects oversized ASCII and Unicode before parsing", () => {
    for (const content of [
        "x".repeat(2 * 1024 * 1024 + 1),
        "🪴".repeat(524_289),
    ]) {
        const { result, calls } = run({
            pages: [{ status: 200, html_content: content }],
        });
        assert.equal(result.status, "unavailable");
        assert.equal(result.text, "");
        assert.match(result.error, /limit/);
        assert.equal(calls.length, 1);
    }
});

test("invalid character limits and request shapes reject before HTTP", () => {
    for (const request of [
        null,
        [],
        { url: "https://docs.example/", maxCharacters: true },
        { url: "https://docs.example/", maxCharacters: 0 },
        { url: "https://docs.example/", maxCharacters: 18_001 },
        { url: "https://docs.example/", maxCharacters: 1.5 },
    ]) {
        const { result, calls } = run({ request });
        assert.equal(result.status, "unavailable");
        assert.equal(calls.length, 0);
    }
});

test("percent-encoded credential names reject without retaining values", () => {
    for (const key of [
        "%74oken",
        "api%5Fkey",
        "client-secret",
        "custom_token",
        "bearer",
        "auth",
    ]) {
        const { result, calls } = run({
            request: {
                url: `https://docs.example/?${key}=confidential-marker`,
            },
        });
        assert.equal(result.status, "unavailable");
        assert.equal(calls.length, 0);
        assert.doesNotMatch(JSON.stringify(result), /confidential-marker/);
    }
});

// Two external fixtures (DNS and curl); the adapter, Scrapling, and Chromium are real.
const browserHarness = `
import hashlib, importlib.util, io, json, os, socket, sys, tempfile, time
from pathlib import Path
from curl_cffi import CurlOpt
from curl_cffi.requests import Session
from curl_cffi.requests.models import Response
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
case = json.load(sys.stdin)
calls = []
sleeps = []
received_bytes = 0
if case.get("captureSleeps"):
    def profile(frame, event, function):
        if event == "c_call" and function is time.sleep and frame.f_code.co_name == "_read_browser":
            sleeps.append(frame.f_locals["delay"])
    sys.setprofile(profile)
def resolve(host, port, **kwargs):
    addresses = case.get("dns", {}).get(host, ["93.184.216.34"])
    return [(socket.AF_INET6 if ":" in address else socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port)) for address in addresses]
socket.getaddrinfo = resolve
def request(self, method, **kwargs):
    global received_bytes
    url = kwargs["url"]
    calls.append({"url": url, "method": method, "resolve": self.curl_options.get(CurlOpt.RESOLVE),
                  "maxBytes": self.curl_options.get(CurlOpt.MAXFILESIZE_LARGE), "trustEnv": self.trust_env,
                  "proxy": self.curl_options.get(CurlOpt.PROXY),
                  "redirects": kwargs.get("allow_redirects"), "verify": kwargs.get("verify"),
                  "headers": kwargs.get("headers", {})})
    item = case.get("pages", {}).get(url, {"status": 404, "body": "Missing fixture"})
    if isinstance(item, list):
        item = item[min(sum(call["url"] == url for call in calls)-1, len(item)-1)]
    if item.get("timeout"):
        raise TimeoutError("fixture transport timeout")
    response = Response(); response.url = url; response.status_code = item.get("status", 200)
    response.encoding = "utf-8"; response.reason = "Fixture"; response.cookies = {}; response.request = None; response.history = []
    response.headers = {"content-type": "text/html; charset=utf-8", **item.get("headers", {})}
    response.content = item.get("body", "").encode()
    callback = kwargs.get("content_callback")
    if callback:
        chunk_size = case.get("chunkSize", 32)
        for offset in range(0, len(response.content), chunk_size):
            chunk = response.content[offset:offset+chunk_size]
            received_bytes += len(chunk)
            callback(chunk)
        if item.get("timeoutAfterBody"):
            raise TimeoutError("fixture interrupted transfer")
        response.content = b""
    return response
Session.request = request
if "requestLimit" in case: adapter.MAX_BROWSER_REQUESTS = case["requestLimit"]
if "byteLimit" in case: adapter.MAX_BROWSER_BYTES = case["byteLimit"]
with tempfile.TemporaryDirectory() as root:
    os.environ["FETCH_CACHE_DIR"] = root
    request = {"url": "https://docs.example/", "mode": "dynamic", **case.get("request", {})}
    sys.stdin = io.StringIO(json.dumps(request)); result = adapter.main()
    cached = [json.loads(path.read_text(encoding="utf-8")) for path in Path(root).glob("*.json")]
    paths = [path.name for path in Path(root).glob("*.json")]
    second = None
    if case.get("readAgain"):
        sys.stdin = io.StringIO(json.dumps(request)); second = adapter.main()
    if case.get("readHttp"):
        sys.stdin = io.StringIO(json.dumps({**request, "mode": "http"})); second = adapter.main()
        paths = [path.name for path in Path(root).glob("*.json")]
    print(json.dumps({"result": result, "second": second, "calls": calls, "cached": cached, "paths": paths,
                      "sleeps": sleeps, "receivedBytes": received_bytes}))
`;

function runBrowser(overrides = {}) {
    const child = spawnSync(python, ["-c", browserHarness, adapter], {
        input: JSON.stringify(overrides),
        encoding: "utf8",
        timeout: 35_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    return JSON.parse(child.stdout);
}

const browserOptions = { skip: process.env.RUN_BROWSER_FETCH !== "1" };

test(
    "HTTP transport uses the DNS-adjusted deadline and rejects late responses",
    { skip: !process.env.PYTHONPATH && process.env.RUN_LIVE_FETCH !== "1" },
    () => {
        const script = `
import importlib.util, io, json, sys
from curl_cffi.requests import Session
from curl_cffi.requests.models import Response
from scrapling.fetchers import FetcherSession
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
results = []
for dns_end in [79, 81]:
    calls = []
    ticks = 0
    now = 0
    def clock():
        global ticks
        ticks += 1
        return 0 if ticks <= 2 else now
    def request(self, method, **kwargs):
        global now
        calls.append(kwargs["timeout"])
        now = 81
        response = Response(); response.url = kwargs["url"]; response.status_code = 200
        response.reason = "OK"; response.encoding = "utf-8"; response.content = b"<p>Late model documentation</p>"
        response.headers = {"content-type":"text/html"}; response.cookies = {}; response.request = None; response.history = []
        return response
    Session.request = request
    adapter.time.monotonic = clock
    now = dns_end
    sys.stdin = io.StringIO(json.dumps({"url":"https://1.1.1.1/"}))
    result = adapter.main()
    assert result["status"] == "unavailable" and "deadline" in result["error"], result
    assert calls == ([1] if dns_end == 79 else []), calls
    results.append(result)
print(json.dumps({"passed":True}))
`;
        assert.equal(run({}, script).passed, true);
    },
);

test(
    "interrupted browser transfers consume the shared byte budget before retrying",
    { skip: !process.env.PYTHONPATH && process.env.RUN_BROWSER_FETCH !== "1" },
    () => {
        const { result, calls, cached, sleeps, receivedBytes } = runBrowser({
            captureSleeps: true,
            byteLimit: 250,
            chunkSize: 10,
            pages: {
                "https://docs.example/": {
                    status: 302,
                    headers: { location: "/final" },
                    body: "r".repeat(80),
                },
                "https://docs.example/final": {
                    body: "x".repeat(80),
                    timeoutAfterBody: true,
                },
            },
        });
        assert.equal(result.status, "unavailable");
        assert.match(result.error, /byte limit/);
        assert.equal(cached.length, 0);
        assert.equal(calls.length, 4);
        assert.deepEqual(sleeps, [2]);
        assert.equal(
            receivedBytes,
            260,
            "the crossing chunk must stop transfer and prevent another attempt",
        );
    },
);

test(
    "real browser retries a transient subrequest once and caches only recovered content",
    browserOptions,
    () => {
        const { result, calls, cached, sleeps } = runBrowser({
            captureSleeps: true,
            pages: {
                "https://docs.example/": {
                    body: '<html><body><p id="content">Loading</p><script>fetch("/data").then(r=>r.text()).then(t=>document.getElementById("content").textContent=t)</script></body></html>',
                },
                "https://docs.example/data": [
                    { timeout: true },
                    {
                        body: "Recovered model documentation",
                        headers: { "content-type": "text/plain" },
                    },
                ],
            },
        });
        assert.equal(result.status, "fetched", result.error);
        assert.equal(result.text, "Recovered model documentation");
        assert.deepEqual(sleeps, [2]);
        assert.deepEqual(
            calls.map((call) => call.url),
            [
                "https://docs.example/",
                "https://docs.example/data",
                "https://docs.example/",
                "https://docs.example/data",
            ],
        );
        assert.equal(cached.length, 1);
        assert.equal(cached[0].text, "Recovered model documentation");
    },
);

test(
    "real browser retry preserves cumulative request limits and prefetch retry honors backoff",
    browserOptions,
    () => {
        const content =
            '<html><body><p>Public model documentation</p><script>fetch("/data")</script></body></html>';
        const capped = runBrowser({
            captureSleeps: true,
            requestLimit: 4,
            pages: {
                "https://docs.example/": { body: content },
                "https://docs.example/data": { timeout: true },
            },
        });
        assert.equal(capped.result.status, "unavailable");
        assert.match(capped.result.error, /request.*limit/);
        assert.equal(capped.calls.length, 2);
        assert.deepEqual(capped.sleeps, [2]);
        assert.equal(capped.cached.length, 0);
        const recovered = runBrowser({
            captureSleeps: true,
            pages: {
                "https://docs.example/": [
                    { status: 503 },
                    {
                        body: "<html><body>Recovered prefetch documentation</body></html>",
                    },
                ],
            },
        });
        assert.equal(
            recovered.result.status,
            "fetched",
            recovered.result.error,
        );
        assert.equal(recovered.result.text, "Recovered prefetch documentation");
        assert.equal(recovered.calls.length, 2);
        assert.deepEqual(recovered.sleeps, [2]);
    },
);

test("browser deadline and write-method rejection happen before DNS or transport", () => {
    const script = `
import importlib.util, json, sys, time
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
def forbidden(*args, **kwargs): raise AssertionError("DNS or transport executed")
adapter.socket.getaddrinfo = forbidden
for deadline, method, message in [(time.monotonic()-1,"GET","deadline"),(time.monotonic()+10,"POST","method")]:
    guard = adapter._BrowserGuard(deadline)
    try: guard.fetch("https://docs.example/", method)
    except adapter.ValidationError as error: assert message in str(error)
    else: raise AssertionError("request accepted")
    assert guard.requests == 0 and guard.bytes == 0
print(json.dumps({"passed": True}))
`;
    assert.equal(run({}, script).passed, true);
});

test(
    "real stealth browser renders JavaScript through pinned GET transport and caches separate evidence",
    browserOptions,
    () => {
        const { result, second, calls, cached, paths } = runBrowser({
            readAgain: true,
            pages: {
                "https://docs.example/": {
                    status: 302,
                    headers: { location: "/final" },
                },
                "https://docs.example/final": {
                    body: '<html><body><p id="content">Loading</p><a href="/models/new">New model</a><script>fetch("/data").then(r=>r.text()).then(t=>document.getElementById("content").textContent=t)</script></body></html>',
                },
                "https://docs.example/data": {
                    body: "Rendered model documentation",
                    headers: { "content-type": "text/plain" },
                },
            },
        });
        assert.equal(result.status, "fetched", result.error);
        assert.equal(result.method, "scrapling-browser");
        assert.equal(result.url, "https://docs.example/final");
        assert.match(result.text, /Rendered model documentation/);
        assert.equal(result.links[0].url, "https://docs.example/models/new");
        assert.equal(second.cached, true);
        assert.equal(second.pageDigest, result.pageDigest);
        assert.equal(cached.length, 1);
        assert.equal(cached[0].text, result.text);
        assert.equal(cached[0].method, "scrapling-browser");
        assert.equal(cached[0].url, result.url);
        assert.deepEqual(cached[0].links, result.links);
        assert.equal(paths.length, 1);
        for (const call of calls) {
            assert.equal(call.method, "GET");
            assert.equal(call.trustEnv, false);
            assert.equal(call.proxy, "");
            assert.equal(call.redirects, false);
            assert.equal(call.verify, true);
            assert.ok(call.maxBytes <= 2 * 1024 * 1024);
            assert.deepEqual(call.resolve, ["docs.example:443:93.184.216.34"]);
            assert.ok(
                Object.keys(call.headers).every((key) =>
                    ["accept", "accept-language", "user-agent"].includes(
                        key.toLowerCase(),
                    ),
                ),
            );
        }
        assert.equal(
            calls.filter((call) => call.url === "https://docs.example/final")
                .length,
            1,
        );
    },
);

test(
    "real browser private subrequests, private redirects, and write methods never reach transport",
    browserOptions,
    () => {
        for (const script of [
            'fetch("https://private.example/models")',
            'fetch("/redirect")',
            'fetch("/write",{method:"POST",body:"fixture"})',
            'fetch("https://private.example/models").catch(()=>fetch("/data"))',
        ]) {
            const { result, calls, cached, sleeps } = runBrowser({
                captureSleeps: true,
                dns: { "private.example": ["127.0.0.1"] },
                pages: {
                    "https://docs.example/": {
                        body: `<html><body><p>Public model page</p><script>${script}</script></body></html>`,
                    },
                    "https://docs.example/redirect": {
                        status: 302,
                        headers: { location: "https://private.example/models" },
                    },
                    "https://docs.example/data": { timeout: true },
                },
            });
            assert.equal(result.status, "unavailable", script);
            assert.equal(cached.length, 0);
            assert.deepEqual(
                sleeps,
                [],
                "policy failures must not become retryable after a later timeout",
            );
            assert.equal(
                calls.filter((call) => call.url === "https://docs.example/")
                    .length,
                1,
            );
            assert.ok(
                calls.every(
                    (call) =>
                        !call.url.includes("private.example") &&
                        call.method === "GET",
                ),
            );
            assert.equal(
                calls.filter((call) => call.url.endsWith("/write")).length,
                0,
            );
        }
    },
);

test(
    "real browser has no WebRTC or worker realm and websocket egress is closed",
    browserOptions,
    () => {
        const { result, calls } = runBrowser({
            pages: {
                "https://docs.example/": {
                    body: '<html><body><p id="content">Waiting</p><script>const names=["RTCPeerConnection","webkitRTCPeerConnection","WebTransport","Worker","SharedWorker"];document.getElementById("content").textContent=names.every(n=>typeof globalThis[n]==="undefined")?"Egress constructors disabled":"Failed";new WebSocket("wss://private.example/")</script></body></html>',
                },
            },
        });
        assert.equal(result.status, "fetched", result.error);
        assert.equal(result.text, "Egress constructors disabled");
        assert.ok(calls.every((call) => !call.url.includes("private.example")));
    },
);

test(
    "real browser enforces request and cumulative byte ceilings before caching",
    browserOptions,
    () => {
        const pages = {
            "https://docs.example/": {
                body: '<html><body><p>Public model page</p><script>fetch("/a").then(()=>fetch("/b"))</script></body></html>',
            },
            "https://docs.example/a": { body: "x".repeat(80) },
            "https://docs.example/b": { body: "y".repeat(80) },
        };
        for (const limits of [{ requestLimit: 3 }, { byteLimit: 170 }]) {
            const { result, cached, calls } = runBrowser({ ...limits, pages });
            assert.equal(result.status, "unavailable");
            assert.equal(cached.length, 0);
            assert.ok(calls.length <= 2);
            assert.match(result.error, /limit/);
        }
    },
);

test(
    "real browser rejects HTTP200 challenges and login screens without caching",
    browserOptions,
    () => {
        for (const body of [
            "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>",
            '<html><body><form action="/login"><input type="password"></form><p>Please sign in to continue</p></body></html>',
            "<html><body><script>window.empty=true</script></body></html>",
        ]) {
            const { result, cached } = runBrowser({
                pages: { "https://docs.example/": { body } },
            });
            assert.equal(result.status, "unavailable");
            assert.match(result.error, /challenge|login|public/);
            assert.equal(cached.length, 0);
        }
        const documentation = runBrowser({
            pages: {
                "https://docs.example/": {
                    body: "<html><head><title>Authentication documentation</title></head><body><p>Use this public model API documentation to learn how to sign in and configure authentication.</p></body></html>",
                },
            },
        });
        assert.equal(
            documentation.result.status,
            "fetched",
            documentation.result.error,
        );
    },
);

test(
    "browser and HTTP caches for one URL cannot collide",
    browserOptions,
    () => {
        const { result, second, paths, calls } = runBrowser({
            readHttp: true,
            pages: {
                "https://docs.example/": {
                    body: '<html><body><p id="content">Raw source</p><script>document.getElementById("content").textContent="Rendered source"</script></body></html>',
                },
            },
        });
        assert.equal(result.text, "Rendered source");
        assert.equal(second.text, "Raw source");
        assert.equal(second.method, "scrapling-http");
        assert.equal(second.cached, false);
        assert.equal(paths.length, 2);
        assert.equal(calls.length, 2);
    },
);

test(
    "missing websocket interception closes the real browser context before navigation",
    browserOptions,
    () => {
        const script = `
import importlib.util, json, sys, time
from patchright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
with sync_playwright() as engine:
    browser = engine.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    context.route_web_socket = None
    guard = adapter._BrowserGuard(time.monotonic()+5)
    try: guard.setup(page)
    except adapter.ValidationError: pass
    assert not guard.setup_complete
    assert context.pages == []
    assert guard.error == "browser egress guard setup failed"
    assert guard.requests == 0
    browser.close()
print(json.dumps({"passed": True}))
`;
        const result = run({}, script);
        assert.equal(result.passed, true);
    },
);
