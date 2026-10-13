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
curl.CurlOpt = types.SimpleNamespace(RESOLVE=10203, MAXFILESIZE_LARGE=30117)
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
                  "trust_env": self.trust_env, "redirects": kwargs.get("allow_redirects")})
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
        monotonic: [0, 79, 79],
        pages: [{ status: 503, headers: {} }],
    });
    assert.equal(result.status, "unavailable");
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
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
sys.modules["curl_cffi"] = types.SimpleNamespace(CurlOpt=types.SimpleNamespace(RESOLVE=1, MAXFILESIZE_LARGE=2))
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
