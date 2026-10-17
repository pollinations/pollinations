import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}) {
    const client = new Client(
        { name: "http-probe-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://http-probe-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${TOKEN}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

function mockTargets(t, targets) {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        const target = targets[url];
        if (!target) throw new Error(`getaddrinfo ENOTFOUND ${url}`);
        return target();
    });
    return calls;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://http-probe-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://http-probe-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        assert.deepEqual(
            (await client.listTools()).tools.map(({ name }) => name),
            ["http_probe"],
        );
        await client.close();
    }
});

test("reports each redirect hop, final headers, and missing security headers", async (t) => {
    const calls = mockTargets(t, {
        "http://example.com/": () =>
            new Response(null, {
                status: 301,
                headers: { location: "https://example.com/" },
            }),
        "https://example.com/": () =>
            new Response(null, {
                status: 302,
                headers: { location: "/home" },
            }),
        "https://example.com/home": () =>
            new Response("<html></html>", {
                status: 200,
                headers: [
                    ["content-type", "text/html"],
                    ["strict-transport-security", "max-age=31536000"],
                    ["set-cookie", "a=1"],
                    ["set-cookie", "b=2"],
                ],
            }),
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "http_probe",
        arguments: { url: "http://example.com/" },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.url, "https://example.com/home");
    assert.equal(report.status, 200);
    assert.deepEqual(
        report.redirects.map(({ status, location }) => [status, location]),
        [
            [301, "https://example.com/"],
            [302, "https://example.com/home"],
        ],
    );
    assert.equal(report.headers["content-type"], "text/html");
    assert.deepEqual(report.headers["set-cookie"], ["a=1", "b=2"]);
    assert.deepEqual(report.missingSecurityHeaders, [
        "content-security-policy",
        "x-content-type-options",
        "x-frame-options",
        "referrer-policy",
    ]);
    assert.equal(calls.length, 3);
    for (const { init } of calls) {
        assert.equal(init.method, "GET");
        assert.equal(init.redirect, "manual");
        // The caller's Pollinations key must never reach the probed site.
        assert.equal(init.headers, undefined);
    }
});

test("sends HEAD when asked and reports error statuses", async (t) => {
    const calls = mockTargets(t, {
        "https://example.com/missing": () =>
            new Response(null, { status: 404 }),
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "http_probe",
        arguments: { url: "https://example.com/missing", method: "HEAD" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).status, 404);
    assert.equal(calls[0].init.method, "HEAD");
});

test("stops redirect loops and reports network failures as tool errors", async (t) => {
    mockTargets(t, {
        "https://loop.example/": () =>
            new Response(null, {
                status: 302,
                headers: { location: "https://loop.example/" },
            }),
    });
    const client = await connectClient();
    t.after(() => client.close());

    const loop = await client.callTool({
        name: "http_probe",
        arguments: { url: "https://loop.example/" },
    });
    assert.equal(loop.isError, true);
    assert.match(loop.content[0].text, /Stopped after 10 redirects/);

    const unreachable = await client.callTool({
        name: "http_probe",
        arguments: { url: "https://nope.example/" },
    });
    assert.equal(unreachable.isError, true);
    assert.match(unreachable.content[0].text, /ENOTFOUND/);
});

test("rejects non-http URLs before fetching", async (t) => {
    const calls = mockTargets(t, {});
    const client = await connectClient();
    t.after(() => client.close());
    for (const url of ["ftp://example.com/", "file:///etc/passwd", "nope"]) {
        const result = await client.callTool({
            name: "http_probe",
            arguments: { url },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
});

test("refuses IP-literal and localhost hosts, including after a redirect", async (t) => {
    const calls = mockTargets(t, {
        "https://example.com/internal": () =>
            new Response(null, {
                status: 302,
                headers: { location: "http://169.254.169.254/latest" },
            }),
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const url of [
        "http://127.0.0.1:8787/",
        "http://2130706433/",
        "http://[::1]/",
        "http://localhost/",
        "http://app.localhost/",
        "http://localhost./",
        "http://app.localhost./",
        "http://localhost../",
        "https://example.com/internal",
    ]) {
        const result = await client.callTool({
            name: "http_probe",
            arguments: { url },
        });
        assert.equal(result.isError, true, url);
        assert.match(result.content[0].text, /is not a public host name/);
    }
    assert.deepEqual(
        calls.map(({ url }) => url),
        ["https://example.com/internal"],
    );
});

test("applies one total timeout across every redirect hop", async (t) => {
    const controller = new AbortController();
    const timeout = t.mock.method(
        AbortSignal,
        "timeout",
        () => controller.signal,
    );
    const signals = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        signals.push(init.signal);
        if (String(input) === "https://slow.example/") {
            controller.abort(new Error("The operation timed out"));
            throw init.signal.reason;
        }
        return new Response(null, {
            status: 302,
            headers: { location: "https://slow.example/" },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "http_probe",
        arguments: { url: "https://start.example/" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /timed out/);
    assert.equal(timeout.mock.callCount(), 1);
    assert.deepEqual(timeout.mock.calls[0].arguments, [10_000]);
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
});
