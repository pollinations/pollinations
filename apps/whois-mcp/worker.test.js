import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { setFetchImpl, clearCache } from "./worker.js";

// The worker's outbound fetch is injected, so these tests never touch the network.
// That keeps CI deterministic: a real rdap.org 429 must not turn into a red build.

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient() {
    const client = new Client(
        { name: "whois-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://whois-mcp.pollinations.ai"),
        { fetch: localFetch, requestInit: {} },
    );
    await client.connect(transport);
    return client;
}

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/rdap+json", ...headers },
    });
}

const DOMAIN_FIXTURE = {
    objectClassName: "domain",
    ldhName: "EXAMPLE.COM",
    handle: "2336799_DOMAIN_COM-VRSN",
    status: ["client delete prohibited", "client transfer prohibited"],
    events: [
        { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
        { eventAction: "expiration", eventDate: "2026-08-13T04:00:00Z" },
    ],
    nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }, { ldhName: "B.IANA-SERVERS.NET" }],
    entities: [
        {
            roles: ["registrar"],
            vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"]]],
        },
    ],
};

const IP_FIXTURE = {
    objectClassName: "ip network",
    handle: "NET-8-8-8-0-2",
    name: "GOGL",
    country: "US",
    type: "DIRECT ALLOCATION",
    ipVersion: "v4",
    startAddress: "8.8.8.0",
    endAddress: "8.8.8.255",
    events: [{ eventAction: "registration", eventDate: "2023-12-28T00:00:00Z" }],
};

function mockFetch(handler) {
    clearCache();
    const calls = [];
    setFetchImpl(async (url, init) => {
        calls.push({ url, init });
        return handler(url, init);
    });
    return calls;
}

async function callTool(name, args) {
    const client = await connectClient();
    try {
        const res = await client.callTool({ name, arguments: args });
        return JSON.parse(res.content?.[0]?.text ?? "{}");
    } finally {
        await client.close();
    }
}

test("serves health endpoint", async () => {
    const health = await worker.fetch(new Request("https://whois-mcp.pollinations.ai/health"));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
});

test("returns 404 for unknown paths", async () => {
    const res = await worker.fetch(new Request("https://whois-mcp.pollinations.ai/nope"));
    assert.equal(res.status, 404);
});

test("domain_whois summarizes a domain", async (t) => {
    const calls = mockFetch(async () => jsonResponse(DOMAIN_FIXTURE));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const out = await callTool("domain_whois", { domain: "EXAMPLE.COM" });
    assert.equal(out.domain, "example.com");
    assert.equal(out.handle, "2336799_DOMAIN_COM-VRSN");
    assert.equal(out.events.registration, "1995-08-14T04:00:00Z");
    assert.deepEqual(out.nameservers, ["a.iana-servers.net", "b.iana-servers.net"]);
    assert.equal(out.registrar, "RESERVED-Internet Assigned Numbers Authority");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/rdap\.org\/domain\/example\.com$/);
});

test("domain_whois caches repeat lookups", async (t) => {
    const calls = mockFetch(async () => jsonResponse(DOMAIN_FIXTURE));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    await callTool("domain_whois", { domain: "cached.example" });
    await callTool("domain_whois", { domain: "cached.example" });
    assert.equal(calls.length, 1, "second identical lookup should come from cache");
});

test("domain_whois strips scheme, path and trailing dot", async (t) => {
    const calls = mockFetch(async () => jsonResponse(DOMAIN_FIXTURE));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    await callTool("domain_whois", { domain: "https://example.org/some/path" });
    assert.match(calls[0].url, /\/domain\/example\.org$/);

    await callTool("domain_whois", { domain: "example.net." });
    assert.match(calls[1].url, /\/domain\/example\.net$/);
});

test("domain_whois rejects invalid input without a network call", async (t) => {
    const calls = mockFetch(async () => jsonResponse(DOMAIN_FIXTURE));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    for (const bad of [" ", "localhost", "exa mple.com", "a..b"]) {
        const out = await callTool("domain_whois", { domain: bad });
        assert.equal(out.kind, "invalid_input", `expected invalid_input for ${JSON.stringify(bad)}`);
        assert.equal(out.retryable, false);
    }
    assert.equal(calls.length, 0, "invalid input must not reach the network");
});

test("domain_whois reports a missing domain as not_found", async (t) => {
    mockFetch(async () => new Response("not found", { status: 404 }));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const out = await callTool("domain_whois", { domain: "definitely-not-registered-xyz.test" });
    assert.equal(out.kind, "not_found");
    assert.equal(out.retryable, false);
    assert.equal(out.httpStatus, 404);
});

test("domain_whois surfaces rate limiting instead of calling it not found", async (t) => {
    const calls = mockFetch(
        async () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
    );
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const out = await callTool("domain_whois", { domain: "example.com" });
    assert.equal(out.kind, "upstream_error");
    assert.equal(out.retryable, true);
    assert.equal(out.httpStatus, 429);
    assert.equal(out.retryAfter, 30);
    assert.match(out.error, /rate limiting/i);
    assert.equal(calls.length, 2, "429 should be retried once before giving up");
});

test("domain_whois reports a timeout as retryable", async (t) => {
    mockFetch(async () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
    });
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const out = await callTool("domain_whois", { domain: "example.com" });
    assert.equal(out.kind, "upstream_error");
    assert.equal(out.retryable, true);
    assert.match(out.error, /timed out/i);
});

test("ip_whois summarizes an IPv4 network", async (t) => {
    const calls = mockFetch(async () => jsonResponse(IP_FIXTURE));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const out = await callTool("ip_whois", { ip: "8.8.8.8" });
    assert.equal(out.handle, "NET-8-8-8-0-2");
    assert.equal(out.name, "GOGL");
    assert.equal(out.ipVersion, "v4");
    assert.equal(out.events.registration, "2023-12-28T00:00:00Z");
    assert.match(calls[0].url, /\/ip\/8\.8\.8\.8$/);
});

test("ip_whois accepts IPv6 and rejects bad addresses", async (t) => {
    const calls = mockFetch(async () => jsonResponse({ ...IP_FIXTURE, ipVersion: "v6" }));
    t.after(() => {
        setFetchImpl(null);
        clearCache();
    });

    const ok = await callTool("ip_whois", { ip: "2001:4860:4860::8888" });
    assert.equal(ok.ipVersion, "v6");

    for (const bad of ["999.1.1.1", "kelas", "1.2.3", "1.2.3.4.5"]) {
        const out = await callTool("ip_whois", { ip: bad });
        assert.equal(out.kind, "invalid_input", `expected invalid_input for ${JSON.stringify(bad)}`);
    }
    assert.equal(calls.length, 1, "only the valid IPv6 lookup should hit the network");
});
