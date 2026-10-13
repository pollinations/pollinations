import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adapter = fileURLToPath(new URL("./fetch.py", import.meta.url));
const python = process.env.PYTHON ?? "python";

function run(request) {
    const env = {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PYTHONIOENCODING: "ascii",
    };
    if (process.env.PYTHONPATH) env.PYTHONPATH = process.env.PYTHONPATH;
    const result = spawnSync(python, [adapter], {
        input: JSON.stringify(request).replace(
            /[\u007f-\uffff]/g,
            (character) =>
                `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
        ),
        encoding: "utf8",
        env,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test("rejects non-public and non-HTTPS URLs before importing Scrapling", () => {
    for (const url of [
        "http://example.com",
        "https://localhost",
        "https://127.0.0.1",
        "https://user:pass@example.com",
        "https://example.com/?api_key=secret",
    ]) {
        const result = run({ url, mode: "http", maxCharacters: 100 });
        assert.equal(result.status, "unavailable");
        assert.equal(result.method, "scrapling-http");
        assert.match(
            result.error,
            /public HTTPS|public IP|resolved|credential-bearing/,
        );
        assert.doesNotMatch(JSON.stringify(result), /user:pass|api_key=secret/);
    }
});

test("refuses dynamic mode until browser subrequests can be IP-validated", () => {
    const result = run({
        url: "https://1.1.1.1",
        mode: "dynamic",
        maxCharacters: 100,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.method, "scrapling-dynamic");
    assert.match(result.error, /subrequests/);
});

test("JSON transport preserves Unicode even with an ASCII-only stdout", () => {
    const result = run({
        url: "https://127.0.0.1/🪴",
        mode: "http",
        maxCharacters: 100,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.url, "https://127.0.0.1/🪴");
});

test("rejects invalid focus before fetching", () => {
    for (const focus of [null, "", "   ", 42, "x".repeat(201)]) {
        const result = run({ url: "https://1.1.1.1", focus });
        assert.equal(result.status, "unavailable");
        assert.match(result.error, /focus must be a nonempty string/);
    }
});

test("focus excerpts include models beyond the prefix without changing baseline fetches", () => {
    const result = spawnSync(
        python,
        [
            "-c",
            `
import importlib.util, json, sys, types
spec = importlib.util.spec_from_file_location("fetch", sys.argv[1])
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)
fetch._public_addresses = lambda host, *args: ["1.1.1.1"]
text = "before " * 3000 + "GPT-Model-Example" + " after" * 4000
class Session:
    def __init__(self):
        self._curl_session = types.SimpleNamespace()
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def get(self, *args, **kwargs):
        return types.SimpleNamespace(status=200, headers={}, html_content="<p>" + text + "</p>")
sys.modules["curl_cffi"] = types.SimpleNamespace(CurlOpt=types.SimpleNamespace(RESOLVE=1, MAXFILESIZE_LARGE=2))
sys.modules["scrapling.fetchers"] = types.SimpleNamespace(FetcherSession=Session)
requests = [(18000, "gpt-model-example"), (18000, "unknown-model"), (18000, None), (20, "gpt-model-example")]
print(json.dumps([fetch._read_http("https://example.com", limit, focus) for limit, focus in requests]))
`,
            adapter,
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const [focused, missing, baseline, narrow] = JSON.parse(result.stdout);
    for (const fetched of [focused, missing, baseline, narrow]) {
        assert.equal(fetched.status, "fetched", fetched.error);
    }
    assert.equal(focused.focusMatched, true);
    assert.equal(focused.excerptStart, 19000);
    assert.equal(focused.totalCharacters, 45000 + "GPT-Model-Example".length);
    assert.equal(focused.text.indexOf("GPT-Model-Example"), 2000);
    assert.equal(focused.text.length, 18000);
    assert.equal(missing.focusMatched, false);
    assert.equal(missing.excerptStart, 0);
    assert.equal(missing.totalCharacters, focused.totalCharacters);
    assert.equal(missing.text, baseline.text);
    assert.equal(baseline.text.length, 18000);
    assert.equal(baseline.text.includes("GPT-Model-Example"), false);
    assert.equal("focusMatched" in baseline, false);
    assert.equal("excerptStart" in baseline, false);
    assert.equal("totalCharacters" in baseline, false);
    assert.equal(narrow.focusMatched, true);
    assert.equal(narrow.text.length, 20);
    assert.ok(narrow.text.includes("GPT-Model-Example"));
});

test("run-local page cache reuses full pages safely and fresh runs detect changes beyond excerpts", () => {
    const result = spawnSync(
        python,
        [
            "-c",
            `
import hashlib, importlib.util, io, json, os, sys, tempfile, types
from pathlib import Path
spec = importlib.util.spec_from_file_location("fetch", sys.argv[1])
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)
fetch.socket.getaddrinfo = lambda host, *args, **kwargs: [(None, None, None, None, (host if host in {"127.0.0.1", "localhost"} else "1.1.1.1", 443))]
count = 0
text = "prefix " * 3000 + "model-one details " * 30 + "model-two details " * 30 + "end " * 5000 + "tail"
class Session:
    def __init__(self): self._curl_session = types.SimpleNamespace()
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def get(self, *args, **kwargs):
        global count
        assert self._curl_session.curl_options[2] == fetch.MAX_RESPONSE_BYTES
        assert self._curl_session.trust_env is False
        assert kwargs == {"follow_redirects": False, "timeout": 20, "retries": 0}
        count += 1
        return types.SimpleNamespace(status=200, headers={}, html_content="<p>" + text + "</p>")
sys.modules["curl_cffi"] = types.SimpleNamespace(CurlOpt=types.SimpleNamespace(RESOLVE=1, MAXFILESIZE_LARGE=2))
sys.modules["scrapling.fetchers"] = types.SimpleNamespace(FetcherSession=Session)
url = "https://example.com/catalog"
with tempfile.TemporaryDirectory() as root:
    os.environ["FETCH_CACHE_DIR"] = str(Path(root) / "first-run")
    first = fetch._read_http(url, 100, "model-one")
    second = fetch._read_http(url, 100, "model-two")
    assert count == 1
    assert first["cached"] is False and second["cached"] is True
    assert first["focusMatched"] and second["focusMatched"]
    assert "model-one" in first["text"] and "model-two" in second["text"]
    assert first["pageDigest"] == second["pageDigest"] == hashlib.sha256(text.encode()).hexdigest()
    assert first["fetchedAt"] == second["fetchedAt"] and first["fetchedAt"].endswith("Z")
    assert first["extractionVersion"] == 2
    path = next(Path(os.environ["FETCH_CACHE_DIR"]).glob("*.json"))
    assert path.name == hashlib.sha256(url.encode()).hexdigest() + ".json"
    valid = json.loads(path.read_text(encoding="utf-8"))
    for changes in [{"text": "altered"}, {"extractionVersion": 3}, {"requestedUrl": "https://other.example/"}, {"url": "https://127.0.0.1/"}, {"fetchedAt": "invalidZ"}, {"text": "x" * (fetch.MAX_RESPONSE_BYTES + 1)}]:
        path.write_text(json.dumps({**valid, **changes}), encoding="utf-8")
        sys.stdin = io.StringIO(json.dumps({"url": url, "focus": "model-one"}))
        failed = fetch.main()
        assert failed["status"] == "unavailable" and failed["error"] == "cached page failed validation"
        assert root not in json.dumps(failed)
    path.write_text("{" , encoding="utf-8")
    sys.stdin = io.StringIO(json.dumps({"url": url}))
    assert fetch.main()["error"] == "cached page failed validation"
    assert count == 1
    path.write_text(json.dumps({**valid, "extractionVersion": 1}), encoding="utf-8")
    upgraded = fetch._read_http(url, 100, "model-one")
    assert count == 2 and upgraded["cached"] is False and upgraded["extractionVersion"] == 2
    assert json.loads(path.read_text())["extractionVersion"] == 2
    path.write_text(json.dumps(valid), encoding="utf-8")
    # A cache hit still resolves the original host before reading cached content.
    fetch.socket.getaddrinfo = lambda *args, **kwargs: [(None, None, None, None, ("127.0.0.1", 443))]
    sys.stdin = io.StringIO(json.dumps({"url": url}))
    assert "public IP" in fetch.main()["error"]
    fetch.socket.getaddrinfo = lambda *args, **kwargs: [(None, None, None, None, ("1.1.1.1", 443))]
    for unsafe in ["http://example.com", "https://user:pass@example.com", "https://example.com/?api_key=secret"]:
        sys.stdin = io.StringIO(json.dumps({"url": unsafe}))
        failed = fetch.main()
        assert failed["status"] == "unavailable"
        assert "secret" not in json.dumps(failed) and "user:pass" not in json.dumps(failed)
    os.environ["FETCH_CACHE_DIR"] = str(Path(root) / "next-run")
    text += "changed beyond excerpt"
    refreshed = fetch._read_http(url, 100, "model-one")
    assert count == 3 and refreshed["cached"] is False
    assert refreshed["text"] == first["text"]
    assert refreshed["pageDigest"] != first["pageDigest"]
    os.environ["FETCH_CACHE_DIR"] = str(Path(root) / "oversized-run")
    text = "x" * (fetch.MAX_RESPONSE_BYTES + 1)
    oversized = fetch._read_http(url, 100)
    assert oversized["status"] == "unavailable" and "fetch limit" in oversized["error"]
    assert not Path(os.environ["FETCH_CACHE_DIR"]).exists()
print(json.dumps({"passed": True}))
`,
            adapter,
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).passed, true);
});

test(
    "fetches an official public page when Scrapling is installed",
    { skip: process.env.RUN_LIVE_FETCH !== "1" },
    () => {
        const result = run({
            url: "https://pypi.org/pypi/scrapling/0.4.15/json",
            mode: "http",
            maxCharacters: 500,
        });
        assert.equal(result.status, "fetched", result.error);
        assert.equal(result.method, "scrapling-http");
        assert.ok(result.text.length > 40);
    },
);

test("HTML tables retain cell boundaries, headers and nested headings without script content", () => {
    const result = spawnSync(
        python,
        [
            "-c",
            `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("fetch", sys.argv[1])
fetch = importlib.util.module_from_spec(spec); spec.loader.exec_module(fetch)
html = '<h2><a></a><div>Text and vision models</div></h2><p>Prices per 1M tokens.</p><table><thead><tr><th>Model</th><th>Input</th><th>Output</th></tr></thead><tbody><tr><td><a>Kimi K3</a></td><td><span>$3.00</span><script>poison</script></td><td>$15.00</td></tr></tbody></table>'
parser = fetch._TextParser(); parser.feed(html); parser.close()
assert parser.text() == '## Text and vision models\\nPrices per 1M tokens.\\n| Model | Input | Output |\\n| --- | --- | --- |\\n| Kimi K3 | $3.00 | $15.00 |', repr(parser.text())
parser = fetch._TextParser(); parser.feed(html.replace('<th>Input</th>', '<th colspan="2">Input</th>')); parser.close()
assert '| --- |' not in parser.text()
parser = fetch._TextParser(); parser.feed('<table><tr><th>Model</th><th>Input</th></tr><tr><td>Qwen | model</td><td>$1</td></tr></table>'); parser.close()
assert 'Qwen &#124; model' in parser.text()
`,
            adapter,
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
});
