import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fetchText } from "./fetch.js";
import { lookup } from "./tools/packages.js";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "packages-tests", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://packages.internal/"),
            {
                requestInit: {
                    headers: {
                        Authorization: "Bearer test-only",
                        Cookie: "session=test-only",
                    },
                },
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
            },
        ),
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
    test(`real MCP ${modern ? "modern" : "legacy"} and scoped npm package`, async (t) => {
        const expected = {
            name: "@scope/pkg",
            version: "1.2.3",
            license: "MIT",
            dependencies: { zod: "^4" },
            peerDependencies: { react: "^19" },
            peerDependenciesMeta: { react: { optional: true } },
            engines: { node: ">=22" },
            deprecated: "Use replacement",
        };
        t.mock.method(globalThis, "fetch", async (url, init) => {
            assert.equal(url, "https://registry.npmjs.org/%40scope%2Fpkg/next");
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
            [
                "hf_model_info",
                "hf_search_models",
                "hf_space_info",
                "osv_query",
                "osv_vulnerability",
                "package_lookup",
            ],
        );
        const data = await call(client, "package_lookup", {
            name: "@scope/pkg",
            version: "next",
        });
        for (const [key, value] of Object.entries(expected))
            assert.deepEqual(data[key], value);
    });
test("npm default latest and exact-version requests", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return Response.json({ name: "zod", version: "4.5.4" });
    });
    for (const version of [undefined, "4.5.4"])
        await lookup({ ecosystem: "npm", name: "zod", version });
    assert.deepEqual(urls, [
        "https://registry.npmjs.org/zod/latest",
        "https://registry.npmjs.org/zod/4.5.4",
    ]);
});
test("PyPI exact/latest keeps SPDX license, dependencies, Python and yank information", async (t) => {
    const info = {
        name: "Example",
        version: "1.0",
        license: null,
        license_expression: "BSD-3-Clause",
        summary: "Café",
        requires_python: ">=3.10",
        requires_dist: ["numpy>=2; python_version >= '3.11'"],
        yanked: true,
        yanked_reason: "broken wheel",
        project_urls: { Source: "https://example.com" },
    };
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return Response.json({ info, unused: "x".repeat(2 * 1024 * 1024) });
    });
    const client = await clientFor(t);
    for (const version of [undefined, "1.0"]) {
        const data = await call(client, "package_lookup", {
            ecosystem: "pypi",
            name: "Example",
            version,
        });
        assert.equal(data.license, "BSD-3-Clause");
        assert.deepEqual(data.dependencies, info.requires_dist);
        assert.equal(data.requiresPython, ">=3.10");
        assert.equal(data.yankedReason, "broken wheel");
        assert.equal(data.yanked, true);
    }
    assert.deepEqual(urls, [
        "https://pypi.org/pypi/Example/json",
        "https://pypi.org/pypi/Example/1.0/json",
    ]);
});
test("Rust sparse index selects highest non-yanked stable and exact versions consistently", async (t) => {
    const releases = [
        {
            name: "serde",
            vers: "1.9.0",
            deps: [{ name: "older" }],
            yanked: false,
        },
        {
            name: "serde",
            vers: "1.10.0",
            deps: [
                {
                    name: "matching",
                    req: "^2",
                    optional: true,
                    kind: "normal",
                    target: "cfg(unix)",
                },
            ],
            rust_version: "1.60",
            features: { std: [] },
            features2: { fast: ["dep:matching"] },
            yanked: false,
        },
        { name: "serde", vers: "1.11.0", deps: [], yanked: true },
        { name: "serde", vers: "2.0.0-rc.1", deps: [], yanked: false },
    ];
    t.mock.method(globalThis, "fetch", async (url) => {
        assert.equal(url, "https://index.crates.io/se/rd/serde");
        return new Response(
            `${releases.map((x) => JSON.stringify(x)).join("\n")}\n`,
        );
    });
    const client = await clientFor(t);
    const data = await call(client, "package_lookup", {
        ecosystem: "crates",
        name: "Serde",
    });
    assert.equal(data.version, "1.10.0");
    assert.deepEqual(data.dependencies, releases[1].deps);
    assert.equal(data.rustVersion, "1.60");
    assert.deepEqual(data.features, { std: [], fast: ["dep:matching"] });
    assert.equal(
        (
            await call(client, "package_lookup", {
                ecosystem: "crates",
                name: "serde",
                version: "1.11.0",
            })
        ).yanked,
        true,
    );
    assert.equal(
        (
            await call(client, "package_lookup", {
                ecosystem: "crates",
                name: "serde",
                version: "2.0.0-rc.1",
            })
        ).version,
        "2.0.0-rc.1",
    );
    await assert.rejects(
        lookup({ ecosystem: "crates", name: "serde", version: "0.0.0" }),
        /not found/,
    );
});
test("Rust short-name index paths and no stable release", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return Response.json({ name: "x", vers: "0.1.0-alpha", yanked: false });
    });
    for (const name of ["A", "Ab", "Abc"])
        await assert.rejects(
            lookup({ ecosystem: "crates", name }),
            /No non-yanked stable/,
        );
    assert.deepEqual(urls, [
        "https://index.crates.io/1/a",
        "https://index.crates.io/2/ab",
        "https://index.crates.io/3/a/abc",
    ]);
});
test("Rust stable versions can have hyphens in build metadata", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            name: "example",
            vers: "1.0.0+stable-build",
            yanked: false,
            deps: [],
        }),
    );
    assert.equal(
        (await lookup({ ecosystem: "crates", name: "example" })).version,
        "1.0.0+stable-build",
    );
});
test("OSV preserves advisories, affected ranges and pagination without claiming safety", async (t) => {
    const advisory = {
        id: "GHSA-example",
        aliases: ["CVE-2025-1234"],
        affected: [
            {
                ranges: [
                    {
                        type: "SEMVER",
                        events: [{ introduced: "0" }, { fixed: "1.2.4" }],
                    },
                ],
            },
        ],
        references: [{ type: "FIX", url: "https://example.com/fix" }],
    };
    t.mock.method(globalThis, "fetch", async (url, init) => {
        if (url.endsWith("/query")) {
            assert.equal(init.method, "POST");
            const body = JSON.parse(init.body);
            assert.deepEqual(body.package, { ecosystem: "npm", name: "pkg" });
            assert.equal(body.version, "1.2.3");
            return Response.json(
                body.page_token
                    ? {}
                    : { vulns: [advisory], next_page_token: "continue-me" },
            );
        }
        assert.equal(url, "https://api.osv.dev/v1/vulns/GHSA-example");
        return Response.json(advisory);
    });
    const client = await clientFor(t);
    const args = { ecosystem: "npm", name: "pkg", version: "1.2.3" };
    assert.deepEqual(await call(client, "osv_query", args), {
        vulns: [advisory],
        next_page_token: "continue-me",
    });
    assert.deepEqual(
        await call(client, "osv_query", { ...args, pageToken: "continue-me" }),
        {},
    );
    assert.deepEqual(
        await call(client, "osv_vulnerability", { id: "GHSA-example" }),
        advisory,
    );
});
test("HF search forwards task and limit; info exposes license and Space stage", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://huggingface.co");
        if (url.pathname === "/api/models") {
            assert.equal(
                url.searchParams.get("pipeline_tag"),
                "text-generation",
            );
            assert.equal(url.searchParams.get("search"), "small model");
            assert.equal(url.searchParams.get("limit"), "1");
            return Response.json([
                {
                    id: "org/model",
                    pipeline_tag: "text-generation",
                    downloads: 12,
                },
                { id: "extra" },
            ]);
        }
        assert.ok(
            ["/api/models/org/model", "/api/spaces/org/demo"].includes(
                url.pathname,
            ),
        );
        return Response.json({
            id: "org/model",
            cardData: { license: "mit" },
            runtime: { stage: "RUNNING" },
            sdk: "gradio",
            gated: "manual",
            tags: Array.from({ length: 22 }, (_, i) => `tag-${i}`),
        });
    });
    const client = await clientFor(t);
    assert.deepEqual(
        await call(client, "hf_search_models", {
            query: "small model",
            task: "text-generation",
            limit: 1,
        }),
        {
            models: [
                { id: "org/model", task: "text-generation", downloads: 12 },
            ],
        },
    );
    for (const [name, id] of [
        ["hf_model_info", "org/model"],
        ["hf_space_info", "org/demo"],
    ]) {
        const data = await call(client, name, { id });
        assert.equal(data.license, "mit");
        assert.equal(data.stage, "RUNNING");
        assert.equal(data.gated, "manual");
        assert.equal(data.tags.length, 20);
        assert.equal(data.tagsTruncated, true);
    }
});
test("invalid input cannot escape provider paths and makes no upstream request", async (t) => {
    t.mock.method(globalThis, "fetch", () => {
        assert.fail("Unexpected upstream call");
    });
    const client = await clientFor(t);
    for (const [name, args] of [
        ["package_lookup", { name: "../../bad" }],
        ["package_lookup", { name: "zod", version: "../latest" }],
        ["hf_model_info", { id: "org/../bad" }],
        ["hf_space_info", { id: "../bad" }],
        ["hf_search_models", { query: "bert", limit: 26 }],
        ["osv_vulnerability", { id: "../query" }],
    ])
        assert.equal(
            (await client.callTool({ name, arguments: args })).isError,
            true,
        );
});
test("HTTP failures, redirects, bad JSON and bad HF shape are MCP errors", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", () => Response.json({}));
    const client = await clientFor(t);
    for (const status of [302, 404, 429, 500]) {
        stub.mock.mockImplementation(
            async () => new Response("error", { status }),
        );
        const result = await client.callTool({
            name: "hf_search_models",
            arguments: { query: "bert" },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, new RegExp(`HTTP ${status}`));
    }
    for (const response of ["bad-json", "{}"]) {
        stub.mock.mockImplementation(async () => new Response(response));
        assert.equal(
            (
                await client.callTool({
                    name: "hf_search_models",
                    arguments: { query: "bert" },
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
            fetchText("https://pypi.org/pypi/numpy/json"),
            /8 MiB/,
        );
        assert.equal(cancelled, true);
        stub.mock.restore();
    }
});
test("large advisories remain complete instead of truncating their JSON", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ details: "x".repeat(4 * 1024 * 1024) }),
    );
    const client = await clientFor(t);
    const result = await client.callTool({
        name: "osv_vulnerability",
        arguments: { id: "GHSA-example" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(
        JSON.parse(result.content[0].text).details.length,
        4 * 1024 * 1024,
    );
});

test("legacy npm names, platform constraints and Python epoch versions", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return url.includes("pypi.org")
            ? Response.json({
                  info: {
                      name: "example",
                      version: "1!2.0",
                      requires_dist: null,
                  },
              })
            : Response.json({
                  name: "JSONStream",
                  version: "1.3.5",
                  os: ["linux", "!win32"],
                  cpu: ["x64"],
              });
    });
    const client = await clientFor(t);
    const npm = await call(client, "package_lookup", { name: "JSONStream" });
    assert.deepEqual(npm.os, ["linux", "!win32"]);
    assert.deepEqual(npm.cpu, ["x64"]);
    const py = await call(client, "package_lookup", {
        ecosystem: "pypi",
        name: "example",
        version: "1!2.0",
    });
    assert.equal(py.version, "1!2.0");
    assert.equal(py.dependencies, null);
    assert.deepEqual(urls, [
        "https://registry.npmjs.org/JSONStream/latest",
        "https://pypi.org/pypi/example/1!2.0/json",
    ]);
});
