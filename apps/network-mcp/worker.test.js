import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { inspect } from "./tools/cidr.js";
import { lookup, readText } from "./tools/dns.js";
import { probe, publicUrl } from "./tools/http.js";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "network-tests", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://network.internal/"),
            {
                requestInit: {
                    headers: {
                        Authorization: "Bearer test-not-a-real-key",
                        Cookie: "test=not-a-real-cookie",
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
test("private Worker and public-internet routing in both environments", () => {
    const config = JSON.parse(
        readFileSync(new URL("./wrangler.jsonc", import.meta.url)),
    );
    for (const x of [config, config.env.staging]) {
        assert.equal(x.workers_dev, false);
        assert.equal(x.preview_urls, false);
        assert.deepEqual(x.routes, []);
    }
    assert.ok(
        config.compatibility_flags.includes("global_fetch_strictly_public"),
    );
});
for (const modern of [false, true])
    test(`real stateless MCP protocol: ${modern ? "modern" : "legacy"}`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            ["dns_lookup", "http_probe", "inspect_cidr"],
        );
        const response = await client.callTool({
            name: "inspect_cidr",
            arguments: {
                cidr: "192.168.1.255/24",
                addresses: ["192.168.1.0", "192.168.2.0", "::1", "invalid"],
            },
        });
        assert.notEqual(response.isError, true);
        const result = JSON.parse(response.content[0].text);
        assert.equal(result.network, "192.168.1.0");
        assert.equal(result.address_count, "256");
        assert.deepEqual(
            result.checks.map((x) => x.contained),
            [true, false, false, false],
        );
    });
test("CIDR preserves IPv6 precision and prefix extremes", () => {
    assert.equal(
        inspect("::/0", []).address_count,
        "340282366920938463463374607431768211456",
    );
    assert.equal(inspect("::1/128", []).last_address, "::1");
    assert.equal(inspect("2001:db8::abcd/64", []).broadcast, null);
    assert.equal(inspect("0.0.0.0/0", []).last_address, "255.255.255.255");
    assert.equal(inspect("10.0.0.1/31", []).address_count, "2");
    assert.equal(inspect("10.0.0.1/32", []).network, "10.0.0.1");
    for (const cidr of ["10.0.0.1/33", "::/129", "hello"])
        assert.throws(() => inspect(cidr, []));
});
test("public URL validation handles normalized IPs, credentials, protocols and ports", () => {
    for (const url of [
        "http://localhost",
        "http://localhost./",
        "http://a.localhost/",
        "http://127.1/",
        "http://2130706433",
        "http://0x7f000001",
        "http://[::1]",
        "http://[::ffff:127.0.0.1]",
        "http://169.254.169.254",
        "https://admin:password@example.com",
        "file:///etc/passwd",
        "ftp://example.com",
        "https://example.com:8080",
        "http://metadata.internal",
        "http://singlehost",
        "http://example.local/",
    ])
        assert.throws(() => publicUrl(url), url);
    assert.equal(
        publicUrl("https://example.com.:443/a#foo").href,
        "https://example.com/a",
    );
});
test("CIDR rejects ambiguous IPv4 notation and scoped IPv6", () => {
    for (const cidr of [
        "010.1.2.3/24",
        "127.1/8",
        "0x7f000001/8",
        "fe80::1%eth0/64",
        "::ffff:010.1.2.3/128",
        "10.0.0.1/08",
    ])
        assert.throws(() => inspect(cidr, []), cidr);
    assert.equal(inspect("10.0.0.0/8", ["010.1.2.3"]).checks[0].valid, false);
    assert.equal(inspect("::ffff:10.0.0.1/128", []).network, "::ffff:a00:1");
});
test("bounded response reader cancels chunked bodies and preserves UTF-8", async () => {
    assert.deepEqual(await readText(new Response("abcd"), 4), {
        text: "abcd",
        truncated: false,
    });
    assert.deepEqual(await readText(new Response("abcde"), 4), {
        text: "abcd",
        truncated: true,
    });
    assert.deepEqual(await readText(new Response("Café"), 5), {
        text: "Café",
        truncated: false,
    });
    let cancelled = false;
    const stream = new ReadableStream({
        start(c) {
            c.enqueue(new Uint8Array(100000));
        },
        cancel() {
            cancelled = true;
        },
    });
    assert.equal((await readText(new Response(stream), 16)).truncated, true);
    assert.ok(cancelled);
});
test("redirect URLs keep the input size limit", () => {
    assert.throws(
        () => publicUrl(`https://example.com/${"x".repeat(2048)}`),
        /2048/,
    );
});
test("DNS preserves NXDOMAIN and rejects HTTP/oversized responses", async (t) => {
    const expected = {
        Status: 3,
        Authority: [{ name: "invalid.", type: 6, data: "soa" }],
    };
    const stub = t.mock.method(globalThis, "fetch", async (url, init) => {
        assert.equal(url.origin, "https://cloudflare-dns.com");
        assert.equal(init.headers.Accept, "application/dns-json");
        assert.equal(url.searchParams.get("type"), "TXT");
        assert.equal(init.redirect, "manual");
        return Response.json(expected);
    });
    assert.deepEqual(await lookup("_dmarc.example.invalid", "txt"), expected);
    stub.mock.mockImplementation(
        async () => new Response("rate limited", { status: 429 }),
    );
    await assert.rejects(lookup("example.com", "A"), /HTTP 429/);
    stub.mock.mockImplementation(
        () =>
            new Response(null, {
                status: 302,
                headers: { location: "https://elsewhere.example" },
            }),
    );
    await assert.rejects(lookup("example.com", "A"), /HTTP 302/);
    stub.mock.mockImplementation(async () => new Response("x".repeat(65537)));
    await assert.rejects(lookup("example.com", "A"), /64 KiB/);
});
function publicDns(url) {
    return Response.json({
        Status: 0,
        Answer:
            url.searchParams.get("type") === "A"
                ? [{ type: 1, data: "93.184.216.34" }]
                : [],
    });
}
test("DNS accepts numeric record types without forwarding credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (url, init) => {
        assert.equal(url.searchParams.get("type"), "257");
        assert.deepEqual(init.headers, { Accept: "application/dns-json" });
        return Response.json({ Status: 0, Answer: [] });
    });
    const client = await clientFor(t);
    assert.notEqual(
        (
            await client.callTool({
                name: "dns_lookup",
                arguments: { name: "example.com", type: 257 },
            })
        ).isError,
        true,
    );
});
test("HTTP redirect chain strips caller credentials and bounds text", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, init) => {
        if (url.hostname === "cloudflare-dns.com") return publicDns(url);
        calls.push([url.href, init]);
        assert.equal(init.headers.Authorization, undefined);
        assert.equal(init.headers.Cookie, undefined);
        assert.equal(init.redirect, "manual");
        if (url.pathname === "/start")
            return new Response(null, {
                status: 302,
                headers: { location: "/final" },
            });
        return new Response("x".repeat(9000), {
            status: 404,
            headers: { "content-type": "text/plain", "set-cookie": "fresh=1" },
        });
    });
    const client = await clientFor(t);
    const result = await client.callTool({
        name: "http_probe",
        arguments: { url: "https://example.com/start" },
    });
    assert.notEqual(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.status, 404);
    assert.equal(data.redirects.length, 1);
    assert.equal(data.preview.text.length, 4096);
    assert.ok(data.preview.truncated);
    assert.deepEqual(data.headers["set-cookie"], ["fresh=1"]);
    assert.equal(calls.length, 2);
});
test("HTTP blocks private DNS answers and unsafe redirects before fetching target", async (t) => {
    let targets = 0;
    const stub = t.mock.method(globalThis, "fetch", async (url) => {
        if (url.hostname === "cloudflare-dns.com")
            return Response.json({
                Status: 0,
                Answer: [{ type: 1, data: "127.0.0.1" }],
            });
        targets++;
        return new Response(null);
    });
    await assert.rejects(probe("https://example.com", "GET"), /public IP/);
    assert.equal(targets, 0);
    stub.mock.mockImplementation(async (url) => {
        if (url.hostname === "cloudflare-dns.com") return publicDns(url);
        targets++;
        return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1" },
        });
    });
    await assert.rejects(probe("https://example.com", "GET"), /public HTTP/);
    assert.equal(targets, 1);
});
test("HTTP stops redirect loops and never reads HEAD or binary bodies", async (t) => {
    const stub = t.mock.method(globalThis, "fetch", async (url) =>
        url.hostname === "cloudflare-dns.com"
            ? publicDns(url)
            : new Response(null, {
                  status: 301,
                  headers: { location: "/loop" },
              }),
    );
    await assert.rejects(probe("https://example.com", "GET"), /five redirects/);
    stub.mock.mockImplementation(async (url) =>
        url.hostname === "cloudflare-dns.com"
            ? publicDns(url)
            : new Response("body", {
                  headers: { "content-type": "image/png" },
              }),
    );
    assert.equal((await probe("https://example.com", "GET")).preview, null);
    assert.equal((await probe("https://example.com", "HEAD")).preview, null);
});
test("tool schemas reject oversized inputs before I/O", async (t) => {
    const client = await clientFor(t);
    for (const [name, args] of [
        ["dns_lookup", { name: "a".repeat(255) }],
        ["dns_lookup", { name: "example.com", type: "65536" }],
        ["http_probe", { url: "https://example.com", method: "POST" }],
        ["inspect_cidr", { cidr: "::/0", addresses: Array(21).fill("::1") }],
    ]) {
        assert.equal(
            (await client.callTool({ name, arguments: args })).isError,
            true,
        );
    }
});
