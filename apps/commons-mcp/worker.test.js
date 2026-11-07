import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { licenceKind, standardWidth } from "./commons.js";
import worker from "./worker.js";

async function client(options = {}) {
    const connection = new Client({ name: "test", version: "1.0.0" }, options);
    await connection.connect(
        new StreamableHTTPClientTransport(new URL("https://commons.invalid/"), {
            fetch: (input, init) => worker.fetch(new Request(input, init)),
            requestInit: {
                headers: {
                    authorization: "Bearer sk_never_upstream",
                    cookie: "private=1",
                },
            },
        }),
    );
    return connection;
}

function file(overrides = {}) {
    return {
        title: "File:Stela D Copan.jpg",
        imageinfo: [
            {
                width: 2400,
                height: 3600,
                thumburl: "https://upload.wikimedia.org/thumb/stela.jpg",
                thumbwidth: 1280,
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Stela",
                extmetadata: {
                    LicenseShortName: { value: "CC BY 4.0" },
                    Artist: { value: '<a href="/wiki/User:X">Alice</a>' },
                },
                ...overrides,
            },
        ],
    };
}

test("the private worker exposes three tools and stays off the public internet", async () => {
    const c = await client();
    assert.deepEqual((await c.listTools()).tools.map((t) => t.name).sort(), [
        "commons_file",
        "commons_licence_check",
        "commons_search",
    ]);
    await c.close();
    for (const path of ["/health", "/nope"])
        assert.equal(
            (await worker.fetch(new Request(`https://commons.invalid${path}`)))
                .status,
            404,
        );
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});

test("plain CC BY is reusable and share-alike is not", () => {
    for (const name of [
        "Public domain",
        "PD-old",
        "CC0",
        "No restrictions",
        "CC BY 4.0",
        "CC BY 3.0",
    ])
        assert.equal(licenceKind(name), "free", name);
    // The usage terms of every one of these read "Creative Commons
    // Attribution ...", so a filter on the word "attribution" would keep the
    // share-alike files and throw away nothing. Only the short name separates
    // them.
    for (const name of ["CC BY-SA 4.0", "CC BY-NC 2.0", "CC BY-ND 4.0", "GFDL"])
        assert.equal(licenceKind(name), "restricted", name);
    assert.equal(licenceKind(""), "unknown");
});

test("thumbnail widths snap up to a width Commons has already rendered", () => {
    assert.equal(standardWidth(1280), 1280);
    assert.equal(standardWidth(1600), 1920);
    assert.equal(standardWidth(161), 320);
    assert.equal(standardWidth(9000), 2560);
});

test("search sends one capped request, credits the author and drops share-alike", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.hostname, "commons.wikimedia.org");
        assert.equal(new Headers(init.headers).has("authorization"), false);
        assert.equal(new Headers(init.headers).has("cookie"), false);
        assert.match(
            new Headers(init.headers).get("user-agent"),
            /Pollinations-Commons/,
        );
        assert.equal(url.searchParams.get("generator"), "categorymembers");
        assert.equal(url.searchParams.get("gcmtitle"), "Category:Maya stelae");
        // Never over the 50 the API serves imageinfo for, and never an
        // unrendered thumbnail width.
        assert.ok(Number(url.searchParams.get("gcmlimit")) <= 50);
        assert.equal(url.searchParams.get("iiurlwidth"), "1280");
        return Response.json({
            query: {
                pages: [
                    file(),
                    file({
                        extmetadata: {
                            LicenseShortName: { value: "CC BY-SA 4.0" },
                        },
                    }),
                    file({ width: 400 }),
                ],
            },
        });
    });
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "commons_search",
        arguments: { category: "Maya stelae", thumbWidth: 1280 },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const { files } = JSON.parse(result.content[0].text);
    assert.equal(files.length, 1);
    assert.equal(files[0].licence, "CC BY 4.0");
    assert.equal(files[0].author, "Alice");
    assert.match(files[0].credit, /Stela D Copan\.jpg — Alice — CC BY 4\.0/);
});

test("a search with neither query nor category fails before any request", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", async () =>
        Response.json({}),
    );
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "commons_search",
        arguments: { thumbWidth: 1280 },
    });
    assert.equal(result.isError, true);
    assert.equal(stub.mock.callCount(), 0);
});

test("a missing file and a rate limit each say what to do", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) =>
        new URL(input).searchParams.get("titles")?.includes("Nope")
            ? Response.json({ query: { pages: [{ missing: true }] } })
            : new Response(null, { status: 429 }),
    );
    const c = await client();
    t.after(() => c.close());
    const missing = await c.callTool({
        name: "commons_file",
        arguments: { title: "File:Nope.jpg" },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No Commons file/);

    const limited = await c.callTool({
        name: "commons_search",
        arguments: { query: "stela" },
    });
    assert.equal(limited.isError, true);
    assert.match(limited.content[0].text, /rate limited/);
});

test("the licence checker works on strings from anywhere", async (t) => {
    const c = await client();
    t.after(() => c.close());
    const result = await c.callTool({
        name: "commons_licence_check",
        arguments: { licence: "CC BY-SA 4.0" },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.content[0].text), {
        licence: "CC BY-SA 4.0",
        kind: "restricted",
        reusable: false,
    });
});
