import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fetchText } from "./fetch.js";
import { lookup } from "./tools/packages.js";
import { searchNuget } from "./tools/nuget.js";
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
            assert.equal(init.redirect, "follow");
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
                "package_downloads",
                "package_lookup",
                "nuget_package_search",
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
test("RubyGems latest and exact versions keep licenses, downloads and dependencies", async (t) => {
    const latest = {
        name: "rails",
        version: "8.1.4.1",
        info: "Ruby on Rails is a full-stack web framework.",
        licenses: ["MIT"],
        homepage_uri: "https://rubyonrails.org",
        source_code_uri: "https://github.com/rails/rails",
        documentation_uri: "https://api.rubyonrails.org",
        platform: "ruby",
        downloads: 813413968,
        version_downloads: 1234,
        yanked: false,
        dependencies: {
            runtime: [{ name: "actionpack", requirements: "= 8.1.4.1" }],
            development: [],
        },
    };
    const exact = {
        ...latest,
        version: "7.1.0",
        number: "7.1.0",
        version_downloads: 42,
    };
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return Response.json(
            url.endsWith("/api/v1/gems/rails.json") ? latest : exact,
        );
    });
    const client = await clientFor(t);
    const data = await call(client, "package_lookup", {
        ecosystem: "rubygems",
        name: "rails",
    });
    assert.equal(data.version, "8.1.4.1");
    assert.deepEqual(data.licenses, ["MIT"]);
    assert.equal(data.downloads, 813413968);
    assert.deepEqual(data.dependencies.runtime, [
        { name: "actionpack", requirements: "= 8.1.4.1" },
    ]);
    assert.equal(
        data.registryUrl,
        "https://rubygems.org/gems/rails/versions/8.1.4.1",
    );
    const pinned = await call(client, "package_lookup", {
        ecosystem: "rubygems",
        name: "rails",
        version: "7.1.0",
    });
    assert.equal(pinned.version, "7.1.0");
    assert.equal(pinned.versionDownloads, 42);
    assert.deepEqual(urls, [
        "https://rubygems.org/api/v1/gems/rails.json",
        "https://rubygems.org/api/v2/rubygems/rails/versions/7.1.0.json",
    ]);
    await assert.rejects(
        lookup({ ecosystem: "rubygems", name: "not a gem" }),
        /Invalid rubygems package name/,
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
test("advisories below the result cap remain complete; larger results return an error without partial JSON", async (t) => {
    let size = 256 * 1024;
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ details: "x".repeat(size) }),
    );
    const client = await clientFor(t);
    let result = await client.callTool({
        name: "osv_vulnerability",
        arguments: { id: "GHSA-example" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).details.length, size);
    size = 512 * 1024;
    result = await client.callTool({
        name: "osv_vulnerability",
        arguments: { id: "GHSA-example" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /512 KiB/);
    assert.doesNotMatch(result.content[0].text, /x{100}/);
});

test("legacy npm names, platform constraints and Python epoch versions", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(url);
        return new URL(url).hostname === "pypi.org"
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

test("Packagist expands the minified list, ranks non-semver and patch tags and matches v-prefixed tags", async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => {
        assert.equal(url, "https://packagist.org/p2/monolog/monolog.json");
        return Response.json({
            minified: "composer/2.0",
            packages: {
                "monolog/monolog": [
                    {
                        name: "monolog/monolog",
                        version: "v3.3.0-RC1",
                        version_normalized: "3.3.0.0-RC1",
                        description: "Logging for PHP",
                        license: ["MIT"],
                        require: { php: ">=8.2" },
                        suggest: { "ext-mongodb": "MongoDB handler" },
                    },
                    { version: "3.10", version_normalized: "3.10.0.0" },
                    {
                        version: "3.10-p1",
                        version_normalized: "3.10.0.0-patch1",
                    },
                    {
                        version: "v3.2.0",
                        version_normalized: "3.2.0.0",
                        require: { php: ">=8.1" },
                    },
                    {
                        version: "v3.1.0",
                        version_normalized: "3.1.0.0",
                        suggest: "__unset",
                    },
                ],
            },
        });
    });
    const client = await clientFor(t);
    const latest = await call(client, "package_lookup", {
        ecosystem: "packagist",
        name: "monolog/monolog",
    });
    assert.equal(latest.name, "monolog/monolog");
    assert.equal(latest.version, "3.10-p1");
    assert.equal(latest.description, "Logging for PHP");
    assert.deepEqual(latest.license, ["MIT"]);
    assert.deepEqual(latest.dependencies, { php: ">=8.2" });
    assert.equal(
        latest.registryUrl,
        "https://packagist.org/packages/monolog/monolog",
    );
    const pinned = await call(client, "package_lookup", {
        ecosystem: "packagist",
        name: "monolog/monolog",
        version: "3.1.0",
    });
    assert.equal(pinned.version, "v3.1.0");
    assert.deepEqual(pinned.dependencies, { php: ">=8.1" });
    assert.equal(pinned.suggest, undefined);
});

test("Go lookup uses @latest without a version and escapes capitals in path and version", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (url) => {
        urls.push(String(url));
        const target = new URL(url);
        assert.equal(target.hostname, "proxy.golang.org");
        if (target.pathname.endsWith(".mod"))
            return new Response("module example\n\ngo 1.22\n");
        if (target.pathname.includes("gin-gonic"))
            return Response.json({
                Version: "v1.12.0",
                Time: "2026-02-28T10:10:09Z",
                Origin: { VCS: "git", URL: "https://github.com/gin-gonic/gin" },
            });
        return Response.json({
            Version: "v68.0.0+incompatible",
            Time: "2023-01-19T11:02:01Z",
        });
    });

    const client = await clientFor(t);
    const gin = await call(client, "package_lookup", {
        ecosystem: "golang",
        name: "github.com/gin-gonic/gin",
    });
    assert.equal(gin.version, "v1.12.0");
    assert.equal(gin.time, "2026-02-28T10:10:09Z");
    assert.equal(gin.origin.VCS, "git");
    assert.match(gin.goMod, /^module example/);
    assert.equal(
        gin.registryUrl,
        "https://pkg.go.dev/github.com/gin-gonic/gin@v1.12.0",
    );

    const azure = await call(client, "package_lookup", {
        ecosystem: "golang",
        name: "github.com/Azure/azure-sdk-for-go",
        version: "v68.0.0+incompatible",
    });
    assert.equal(azure.name, "github.com/Azure/azure-sdk-for-go");
    assert.equal(azure.origin, null);
    await call(client, "package_lookup", {
        ecosystem: "golang",
        name: "git.sr.ht/~emersion/go-scfg",
        version: "v0.1.0",
    });
    assert.deepEqual(urls, [
        "https://proxy.golang.org/github.com/gin-gonic/gin/@latest",
        "https://proxy.golang.org/github.com/gin-gonic/gin/@v/v1.12.0.mod",
        "https://proxy.golang.org/github.com/!azure/azure-sdk-for-go/@v/v68.0.0%2Bincompatible.info",
        "https://proxy.golang.org/github.com/!azure/azure-sdk-for-go/@v/v68.0.0%2Bincompatible.mod",
        "https://proxy.golang.org/git.sr.ht/~emersion/go-scfg/@v/v0.1.0.info",
        "https://proxy.golang.org/git.sr.ht/~emersion/go-scfg/@v/v68.0.0%2Bincompatible.mod",
    ]);
});

test("package_downloads passes through daily counts and validates names", async (t) => {
    const expected = {
        package: "@scope/pkg",
        start: "2026-10-29",
        end: "2026-11-04",
        downloads: [{ day: "2026-11-04", downloads: 42 }],
    };
    t.mock.method(globalThis, "fetch", async (url, init) => {
        assert.equal(
            url,
            "https://api.npmjs.org/downloads/range/last-week/%40scope%2Fpkg",
        );
        assert.equal(init.headers.Authorization, undefined);
        assert.equal(init.headers.Cookie, undefined);
        return Response.json(expected);
    });
    const client = await clientFor(t);
    assert.deepEqual(
        await call(client, "package_downloads", { name: "@scope/pkg" }),
        expected,
    );

    const bad = await client.callTool({
        name: "package_downloads",
        arguments: { name: "not a package!" },
    });
    assert.equal(bad.isError, true);

    const badRange = await client.callTool({
        name: "package_downloads",
        arguments: { name: "zod", range: "since-forever" },
    });
    assert.equal(badRange.isError, true);
});

test("NuGet search discovers the V3 search resource and maps bounded package metadata", async (t) => {
    const urls = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const target = new URL(input);
        urls.push(target);
        assert.equal(init.headers.Authorization, undefined);
        assert.equal(init.headers.Cookie, undefined);
        assert.match(init.headers["User-Agent"], /hello@pollinations.ai/);
        assert.equal(init.redirect, "follow");
        assert.ok(init.signal instanceof AbortSignal);
        if (target.href === "https://api.nuget.org/v3/index.json")
            return Response.json({
                version: "3.0.0",
                resources: [
                    {
                        "@type": "PackageBaseAddress/3.0.0",
                        "@id": "https://api.nuget.org/v3-flatcontainer/",
                    },
                    {
                        "@type": "SearchQueryService/3.5.0",
                        "@id": "https://azuresearch-usnc.nuget.org/query",
                    },
                ],
            });
        assert.equal(target.origin, "https://azuresearch-usnc.nuget.org");
        assert.equal(target.pathname, "/query");
        assert.equal(target.searchParams.get("q"), "json serializer");
        assert.equal(target.searchParams.get("skip"), "20");
        assert.equal(target.searchParams.get("take"), "3");
        assert.equal(target.searchParams.get("prerelease"), "true");
        assert.equal(target.searchParams.get("semVerLevel"), "2.0.0");
        return Response.json({
            totalHits: 41,
            data: [
                {
                    id: "Newtonsoft.Json",
                    version: "13.0.3",
                    title: "Json.NET",
                    description: "Popular JSON framework",
                    authors: ["James Newton-King"],
                    owners: ["JamesNK"],
                    totalDownloads: 1000000,
                    verified: true,
                    projectUrl: "https://www.newtonsoft.com/json",
                    licenseUrl: "https://licenses.nuget.org/MIT",
                    tags: ["json", "serialization"],
                    vulnerabilities: [
                        { advisoryUrl: "https://github.com/advisories/GHSA-demo", severity: "1" },
                    ],
                    packageTypes: [{ name: "Dependency" }],
                    versions: Array.from({ length: 7 }, (_, i) => ({
                        version: `13.0.${7 - i}`,
                        downloads: 100 - i,
                    })),
                },
            ],
        });
    });
    const client = await clientFor(t);
    const data = await call(client, "nuget_package_search", {
        query: "json serializer",
        limit: 3,
        skip: 20,
        prerelease: true,
    });
    assert.equal(data.total_hits, 41);
    assert.equal(data.packages[0].id, "Newtonsoft.Json");
    assert.equal(data.packages[0].verified, true);
    assert.equal(data.packages[0].total_downloads, 1000000);
    assert.deepEqual(data.packages[0].package_types, ["Dependency"]);
    assert.equal(data.packages[0].version_count, 7);
    assert.equal(data.packages[0].versions_truncated, true);
    assert.equal(data.packages[0].versions.length, 5);
    assert.deepEqual(
        urls.map((url) => url.href),
        [
            "https://api.nuget.org/v3/index.json",
            "https://azuresearch-usnc.nuget.org/query?q=json+serializer&skip=20&take=3&prerelease=true&semVerLevel=2.0.0",
        ],
    );
});

test("NuGet search rejects unsupported or unsafe service-index endpoints and malformed search responses", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            resources: [
                {
                    "@type": "SearchQueryService/3.5.0",
                    "@id": "https://attacker.example/query",
                },
            ],
        }),
    );
    await assert.rejects(
        searchNuget({ query: "zod", limit: 10, skip: 0, prerelease: false }),
        /HTTPS nuget.org host/,
    );
    stub.mock.mockImplementation(async () =>
        Response.json({ resources: [] }),
    );
    await assert.rejects(
        searchNuget({ query: "zod", limit: 10, skip: 0, prerelease: false }),
        /no SearchQueryService/,
    );
    stub.mock.mockImplementation(async (input) =>
        String(input).includes("/v3/index.json")
            ? Response.json({
                  resources: [
                      {
                          "@type": "SearchQueryService/3.5.0",
                          "@id": "https://api-v2v3search-0.nuget.org/query",
                      },
                  ],
              })
            : Response.json({ totalHits: "many", data: {} }),
    );
    await assert.rejects(
        searchNuget({ query: "zod", limit: 10, skip: 0, prerelease: false }),
        /invalid response/,
    );
});

test("NuGet MCP rejects invalid search arguments before any upstream request", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", () => {
        assert.fail("Invalid NuGet search input must not make an upstream request");
    });
    const client = await clientFor(t);
    for (const args of [
        { query: "" },
        { query: "x".repeat(201) },
        { query: "zod", limit: 21 },
        { query: "zod", skip: 3001 },
        { query: "zod", prerelease: "true" },
    ]) {
        assert.equal(
            (await client.callTool({ name: "nuget_package_search", arguments: args }))
                .isError,
            true,
            JSON.stringify(args),
        );
    }
    assert.equal(stub.mock.callCount(), 0);
});
