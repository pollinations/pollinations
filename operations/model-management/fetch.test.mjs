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
fetch._public_addresses = lambda host: ["1.1.1.1"]
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
