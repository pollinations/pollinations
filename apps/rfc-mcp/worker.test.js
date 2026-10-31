import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fetchText } from "./fetch.js";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "rfc-tests", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://rfc.internal/"), {
            requestInit: {
                headers: {
                    Authorization: "Bearer test-only",
                    Cookie: "session=test-only",
                },
            },
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
        }),
    );
    t.after(() => client.close());
    return client;
}

async function call(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
}

test("private Worker in both environments", () => {
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
    assert.ok(
        config.compatibility_flags.includes("global_fetch_strictly_public"),
    );
});

for (const modern of [false, true])
    test(`real MCP ${modern ? "modern" : "legacy"} and rfc_metadata lookup`, async (t) => {
        const expected = {
            doc_id: "RFC9110",
            title: "HTTP Semantics",
            abstract:
                "The Hypertext Transfer Protocol (HTTP) is a stateless application-level protocol.",
            status: "INTERNET STANDARD",
            pub_status: "INTERNET STANDARD",
            pub_date: "June 2022",
            authors: [
                "R. Fielding, Ed.",
                "M. Nottingham, Ed.",
                "J. Reschke, Ed.",
            ],
            keywords: ["HTTP", "REST"],
            obsoletes: ["RFC7230", "RFC7231"],
            obsoleted_by: [],
            updates: ["RFC3864"],
            updated_by: [],
            see_also: ["STD0097"],
            doi: "10.17487/RFC9110",
            errata_url: "https://www.rfc-editor.org/errata_search.php?rfc=9110",
        };
        t.mock.method(globalThis, "fetch", async (url, init) => {
            assert.equal(url, "https://www.rfc-editor.org/rfc/rfc9110.json");
            assert.equal(init.headers.Authorization, undefined);
            assert.equal(init.headers.Cookie, undefined);
            assert.match(init.headers["User-Agent"], /hello@pollinations.ai/);
            assert.equal(init.redirect, "manual");
            assert.ok(init.signal instanceof AbortSignal);
            return Response.json(expected);
        });
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            ["rfc_metadata", "rfc_search", "rfc_section"],
        );
        const data = await call(client, "rfc_metadata", { rfc: 9110 });
        assert.equal(data.docId, "RFC9110");
        assert.equal(data.title, "HTTP Semantics");
        assert.deepEqual(data.obsoletes, ["RFC7230", "RFC7231"]);
        assert.equal(data.url, "https://www.rfc-editor.org/rfc/rfc9110");
    });

test("rfc_search queries IETF Datatracker and normalizes RFC numbers", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://datatracker.ietf.org");
        assert.equal(url.pathname, "/api/v1/doc/document/");
        assert.equal(url.searchParams.get("type"), "rfc");
        assert.equal(url.searchParams.get("title__icontains"), "OAuth");
        assert.equal(url.searchParams.get("limit"), "2");
        return Response.json({
            meta: { total_count: 14 },
            objects: [
                {
                    name: "rfc8628",
                    rfc_number: 8628,
                    title: "OAuth 2.0 Device Authorization Grant",
                    abstract: "The OAuth 2.0 device authorization grant...",
                    pages: 21,
                    time: "2019-08-14T15:20:32Z",
                },
                {
                    name: "rfc6749",
                    title: "The OAuth 2.0 Authorization Framework",
                    abstract: "The OAuth 2.0 authorization framework...",
                    pages: 76,
                },
            ],
        });
    });
    const client = await clientFor(t);
    const data = await call(client, "rfc_search", {
        query: "OAuth",
        limit: 2,
    });
    assert.equal(data.totalCount, 14);
    assert.equal(data.rfcs.length, 2);
    assert.equal(data.rfcs[0].rfc, 8628);
    assert.equal(data.rfcs[1].rfc, 6749);
    assert.equal(data.rfcs[1].url, "https://www.rfc-editor.org/rfc/rfc6749");
});

test("rfc_section skips table-of-contents lines and extracts matching section or line range", async (t) => {
    const sampleRfc = [
        "Table of Contents",
        "   3.1.  Device Authorization Request . . . . . . . . . . . . . . 5",
        "   3.2.  Device Authorization Response  . . . . . . . . . . . . . 6",
        "",
        "3.1.  Device Authorization Request",
        "   The client initiates the authorization flow.",
        "",
        "3.2.  Device Authorization Response",
        "   In response, the authorization server generates a unique",
        "   device verification code and an end-user code.",
        "3.2.1.  Verification URI",
        "   Included in the response.",
        "3.3.  User Interaction",
        "   The client instructs the user.",
    ].join("\n");

    t.mock.method(globalThis, "fetch", async (url, init) => {
        assert.equal(url, "https://www.rfc-editor.org/rfc/rfc8628.txt");
        assert.equal(init.headers.Accept, "text/plain");
        return new Response(sampleRfc);
    });
    const client = await clientFor(t);
    const section = await call(client, "rfc_section", {
        rfc: 8628,
        section: "3.2",
    });
    assert.equal(section.startLine, 8);
    assert.equal(section.endLine, 12);
    assert.match(section.content, /unique\n {3}device verification code/);
    assert.doesNotMatch(section.content, /3\.3\.\s+User Interaction/);

    const range = await call(client, "rfc_section", {
        rfc: 8628,
        startLine: 5,
        maxLines: 2,
    });
    assert.equal(range.startLine, 5);
    assert.equal(range.endLine, 6);
    assert.equal(range.truncated, true);
});

test("invalid input makes no upstream request and non-root paths return 404", async (t) => {
    t.mock.method(globalThis, "fetch", () => {
        assert.fail("Unexpected upstream call");
    });
    assert.equal(
        (await worker.fetch(new Request("https://rfc.internal/health"))).status,
        404,
    );
    const client = await clientFor(t);
    for (const [name, args] of [
        ["rfc_metadata", { rfc: 0 }],
        ["rfc_metadata", { rfc: 100000 }],
        ["rfc_search", { query: "   " }],
        ["rfc_search", { query: "http", limit: 26 }],
        ["rfc_section", { rfc: 9110, section: "../etc/passwd" }],
        ["rfc_section", { rfc: 9110, maxLines: 251 }],
    ])
        assert.equal(
            (await client.callTool({ name, arguments: args })).isError,
            true,
        );
});

test("HTTP failures, redirects and bad JSON are MCP errors", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", () => Response.json({}));
    const client = await clientFor(t);
    for (const status of [302, 404, 429, 500]) {
        stub.mock.mockImplementation(
            async () => new Response("error", { status }),
        );
        const result = await client.callTool({
            name: "rfc_search",
            arguments: { query: "http" },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, new RegExp(`HTTP ${status}`));
    }
    for (const response of ["bad-json", "{}"]) {
        stub.mock.mockImplementation(async () => new Response(response));
        assert.equal(
            (
                await client.callTool({
                    name: "rfc_search",
                    arguments: { query: "http" },
                })
            ).isError,
            true,
        );
    }
});

test("oversized upstreams are cancelled, including incorrect Content-Length", async (t) => {
    for (const declared of [true, false]) {
        let cancelled = false;
        const stream = new ReadableStream({
            start(c) {
                c.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
            },
            cancel() {
                cancelled = true;
            },
        });
        const stub = t.mock.method(
            globalThis,
            "fetch",
            async () =>
                new Response(stream, {
                    headers: { "Content-Length": declared ? "99999999" : "1" },
                }),
        );
        await assert.rejects(
            fetchText("https://www.rfc-editor.org/rfc/rfc9110.txt"),
            /8 MiB/,
        );
        assert.equal(cancelled, true);
        stub.mock.restore();
    }
});
