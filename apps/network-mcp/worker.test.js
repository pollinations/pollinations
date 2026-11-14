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
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((x) => x.name).sort(), [
            "announced_prefixes",
            "dns_lookup",
            "domain_whois",
            "http_probe",
            "inspect_cidr",
            "inspect_mac",
            "ip_whois",
        ]);
        // Only the network tools reach the open world; the inspectors are local.
        assert.deepEqual(
            tools
                .filter((x) => x.annotations.openWorldHint !== false)
                .map((x) => x.name)
                .sort(),
            [
                "announced_prefixes",
                "dns_lookup",
                "domain_whois",
                "http_probe",
                "ip_whois",
            ],
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
test("HTTP rejects unsafe redirects without fetching the redirect target or doing DNS preflights", async (t) => {
    let targets = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        assert.equal(url.hostname, "example.com");
        targets++;
        return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1" },
        });
    });
    await assert.rejects(probe("https://example.com", "GET"), /public HTTP/);
    assert.equal(targets, 1);
});

test("RDAP follows registry redirects, normalizes domain and network records, and caches successful lookups", async (t) => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        requests++;
        const url = new URL(input);
        assert.equal(url.hostname, "rdap.org");
        assert.equal(init.redirect, "follow");
        assert.equal(new Headers(init.headers).get("authorization"), null);
        assert.equal(new Headers(init.headers).get("cookie"), null);
        assert.ok(init.signal instanceof AbortSignal);
        const roles = url.pathname.startsWith("/domain/")
            ? ["registrar"]
            : ["registrant"];
        return Response.json({
            ldhName: "EXAMPLE.ORG",
            handle: "fixture-handle",
            startAddress: "192.0.2.0",
            endAddress: "192.0.2.255",
            ipVersion: "v4",
            entities: [
                {
                    roles,
                    vcardArray: [
                        "vcard",
                        [["fn", {}, "text", "Example Registry"]],
                    ],
                },
            ],
            nameservers: [{ ldhName: "NS1.EXAMPLE.ORG" }],
            events: [
                {
                    eventAction: "registration",
                    eventDate: "2000-01-01T00:00:00Z",
                },
            ],
        });
    });
    const c = await clientFor(t);
    const read = async (name, args) => {
        const result = await c.callTool({ name, arguments: args });
        assert.notEqual(result.isError, true, JSON.stringify(result));
        return JSON.parse(result.content[0].text);
    };
    const domain = await read("domain_whois", { domain: "Example.ORG." });
    assert.equal(domain.domain, "example.org");
    assert.equal(domain.registrar, "Example Registry");
    assert.deepEqual(domain.nameservers, ["ns1.example.org"]);
    assert.equal(domain.events.registration, "2000-01-01T00:00:00Z");
    await read("domain_whois", { domain: "example.org" });
    assert.equal(requests, 1);
    const ip = await read("ip_whois", { ip: "192.0.2.1" });
    assert.equal(ip.organization, "Example Registry");
    assert.equal(ip.country, null);
    assert.equal(ip.endAddress, "192.0.2.255");
});

test("RDAP rejects invalid inputs before I/O and exposes upstream rate limits without retrying", async (t) => {
    const stub = t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(null, {
                status: 429,
                headers: { "retry-after": "60" },
            }),
    );
    const c = await clientFor(t);
    for (const [name, args] of [
        ["domain_whois", { domain: "https://example.com/path" }],
        ["ip_whois", { ip: "010.0.0.1" }],
        ["ip_whois", { ip: "fe80::1%en0" }],
    ]) {
        assert.equal(
            (await c.callTool({ name, arguments: args })).isError,
            true,
        );
    }
    assert.equal(stub.mock.callCount(), 0);
    const result = await c.callTool({
        name: "domain_whois",
        arguments: { domain: "limited.example.org" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /429.*60/);
    assert.equal(stub.mock.callCount(), 1);
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
test("inspect_mac parses and normalizes MAC addresses across formats", async (t) => {
    const client = await clientFor(t);
    const unicast = await client.callTool({
        name: "inspect_mac",
        arguments: { address: "00:1A:2B:3C:4D:5E" },
    });
    const uResult = JSON.parse(unicast.content[0].text);
    assert.equal(uResult.valid, true);
    assert.equal(uResult.formats.colon, "00:1a:2b:3c:4d:5e");
    assert.equal(uResult.formats.hyphen, "00-1a-2b-3c-4d-5e");
    assert.equal(uResult.formats.cisco_dot, "001a.2b3c.4d5e");
    assert.equal(uResult.properties.is_unicast, true);
    assert.equal(uResult.properties.is_multicast, false);
    assert.equal(uResult.properties.is_universally_administered, true);

    const multicast = await client.callTool({
        name: "inspect_mac",
        arguments: { address: "01-80-c2-00-00-00" },
    });
    const mResult = JSON.parse(multicast.content[0].text);
    assert.equal(mResult.properties.is_multicast, true);
    assert.equal(mResult.properties.is_unicast, false);

    const broadcast = await client.callTool({
        name: "inspect_mac",
        arguments: { address: "ffff.ffff.ffff" },
    });
    const bResult = JSON.parse(broadcast.content[0].text);
    assert.equal(bResult.properties.is_broadcast, true);
});

test("RIPEstat announced prefixes summarizes counts and the first 20, and rejects bad ASNs before I/O", async (t) => {
    // Trimmed real fixture from the live announced-prefixes response for
    // AS15169 (2026-11-14): 25 of the real 1,441 prefixes. The first one
    // carries its real 4 gapped timelines; the rest share one window.
    const window = [
        { starttime: "2026-10-31T16:00:00", endtime: "2026-11-14T16:00:00" },
    ];
    const googlePrefixes = [
        {
            prefix: "35.206.9.0/24",
            timelines: [
                {
                    starttime: "2026-10-31T16:00:00",
                    endtime: "2026-11-02T08:00:00",
                },
                {
                    starttime: "2026-11-03T00:00:00",
                    endtime: "2026-11-04T08:00:00",
                },
                {
                    starttime: "2026-11-05T00:00:00",
                    endtime: "2026-11-05T08:00:00",
                },
                {
                    starttime: "2026-11-06T00:00:00",
                    endtime: "2026-11-14T16:00:00",
                },
            ],
        },
        ...[
            "74.125.128.0/24",
            "172.217.169.0/24",
            "142.250.17.0/24",
            "74.125.23.0/24",
            "172.217.192.0/24",
            "2800:3f0:4005::/48",
            "34.1.71.0/24",
            "192.179.32.0/24",
            "34.4.96.0/22",
            "172.217.204.0/24",
            "142.251.33.0/24",
            "2001:4860:4823::/48",
            "108.177.15.0/24",
            "172.253.129.0/24",
            "173.194.216.0/24",
            "192.178.234.0/24",
            "2600:1902:40::/44",
            "108.177.119.0/24",
            "152.65.247.0/24",
            "192.179.17.0/24",
            "142.250.16.0/24",
            "172.217.200.0/24",
            "172.217.114.0/24",
            "74.125.127.0/24",
        ].map((prefix) => ({ prefix, timelines: window })),
    ];
    const google = {
        messages: [],
        status: "ok",
        status_code: 200,
        data: {
            prefixes: googlePrefixes,
            query_starttime: "2026-10-31T16:00:00",
            query_endtime: "2026-11-14T16:00:00",
            resource: "15169",
            latest_time: "2026-11-14T16:00:00",
            earliest_time: "2000-08-01T00:00:00",
        },
    };
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        requests++;
        const url = new URL(input);
        assert.equal(url.hostname, "stat.ripe.net");
        assert.equal(url.pathname, "/data/announced-prefixes/data.json");
        assert.equal(url.searchParams.get("resource"), "AS15169");
        assert.equal(new Headers(init.headers).get("authorization"), null);
        assert.equal(new Headers(init.headers).get("cookie"), null);
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json(google);
    });
    const c = await clientFor(t);
    const read = async (args) => {
        const result = await c.callTool({
            name: "announced_prefixes",
            arguments: args,
        });
        assert.notEqual(result.isError, true, JSON.stringify(result));
        return JSON.parse(result.content[0].text);
    };
    const data = await read({ asn: "AS15169" });
    assert.equal(data.asn, 15169);
    assert.equal(data.total_prefixes, 25);
    assert.equal(data.ipv4_prefixes, 22);
    assert.equal(data.ipv6_prefixes, 3);
    assert.equal(data.query_starttime, "2026-10-31T16:00:00");
    assert.equal(data.query_endtime, "2026-11-14T16:00:00");
    assert.equal(data.prefixes_returned, 20);
    assert.equal(data.prefixes_truncated, true);
    assert.deepEqual(data.prefixes[0], {
        prefix: "35.206.9.0/24",
        first_seen: "2026-10-31T16:00:00",
        last_seen: "2026-11-14T16:00:00",
    });
    assert.deepEqual(data.prefixes[1], {
        prefix: "74.125.128.0/24",
        first_seen: "2026-10-31T16:00:00",
        last_seen: "2026-11-14T16:00:00",
    });
    await read({ asn: "15169" });
    assert.equal(requests, 2);
});

test("RIPEstat announced prefixes handles empty results, upstream errors and bad ASNs", async (t) => {
    let requests = 0;
    const stub = t.mock.method(globalThis, "fetch", async (input) => {
        requests++;
        const url = new URL(input);
        if (url.searchParams.get("resource") === "AS99999999")
            return Response.json({
                messages: [],
                status: "ok",
                status_code: 200,
                data: {
                    prefixes: [],
                    query_starttime: "2026-10-31T16:00:00",
                    query_endtime: "2026-11-14T16:00:00",
                    resource: "99999999",
                },
            });
        if (url.searchParams.get("resource") === "AS15169")
            return Response.json({
                messages: [["error", "upstream is having a bad day"]],
                status: "error",
                status_code: 200,
                data: {},
            });
        return new Response(null, { status: 400 });
    });
    const c = await clientFor(t);
    const empty = await c.callTool({
        name: "announced_prefixes",
        arguments: { asn: "99999999" },
    });
    assert.notEqual(empty.isError, true, JSON.stringify(empty));
    const emptyData = JSON.parse(empty.content[0].text);
    assert.equal(emptyData.total_prefixes, 0);
    assert.deepEqual(emptyData.prefixes, []);
    assert.equal(emptyData.prefixes_truncated, false);
    const error = await c.callTool({
        name: "announced_prefixes",
        arguments: { asn: "15169" },
    });
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /upstream is having a bad day/);
    for (const asn of ["notanas", "AS4294967296", "AS-1", ""]) {
        assert.equal(
            (
                await c.callTool({
                    name: "announced_prefixes",
                    arguments: { asn },
                })
            ).isError,
            true,
        );
    }
    assert.equal(requests, 2);
    stub.mock.mockImplementation(
        async () => new Response(null, { status: 400 }),
    );
    const bad = await c.callTool({
        name: "announced_prefixes",
        arguments: { asn: "15169" },
    });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /400/);
});
