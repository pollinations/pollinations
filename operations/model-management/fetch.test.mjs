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
