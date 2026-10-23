import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const ORIGIN = "https://jobs-mcp.pollinations.ai";
const API_BASE = "https://gen.pollinations.ai";
const JOB_ID = "ab12".repeat(16);
const EXPECTED_TOOLS = [
    "download_media_job_result",
    "get_media_job",
    "submit_media_job",
    "wait_media_job",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "jobs-mcp-worker-test", version: "0.1.0" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(new URL(ORIGIN), {
        fetch: localFetch,
        requestInit: {
            headers: { Authorization: `Bearer ${token}` },
        },
    });
    await client.connect(transport);
    return client;
}

function payload(result) {
    assert.notEqual(result.isError, true);
    assert.equal(result.content.length >= 1, true);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
}

function jobPayload(overrides = {}) {
    return {
        id: JOB_ID,
        status: "pending",
        status_url: `${API_BASE}/v1/jobs/${JOB_ID}`,
        result_url: `${API_BASE}/v1/jobs/${JOB_ID}/result`,
        created_at: "2026-10-23T00:00:00.000Z",
        ...overrides,
    };
}

test("serves health, refuses unauthenticated access, rejects batches", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.endpoint, "/");
    assert.equal(body.stateless, true);
    assert.equal(body.transport, "streamable-http");

    const unauthorized = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="jobs-mcp.pollinations.ai"',
    );

    const batch = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${TOKEN}`,
            },
            body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
        }),
    );
    assert.equal(batch.status, 400);
    assert.equal((await batch.json()).error, "invalid_request");

    const oldEndpoint = await worker.fetch(new Request(`${ORIGIN}/mcp`));
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("submit_media_job queues a generation with Prefer: respond-async", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(
            url.origin + url.pathname,
            `${API_BASE}/image/a%20red%20fox`,
        );
        assert.equal(url.searchParams.get("model"), "google/flux");
        assert.equal(url.searchParams.get("height"), "1024");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("prefer"), "respond-async");
        assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
        return new Response(JSON.stringify(jobPayload()), {
            status: 202,
            headers: {
                "Content-Type": "application/json",
                "Location": `${API_BASE}/v1/jobs/${JOB_ID}`,
                "Retry-After": "30",
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "submit_media_job",
        arguments: {
            resource: "image",
            prompt: "a red fox",
            model: "google/flux",
            params: { height: 1024 },
        },
    });
    const body = payload(result);
    assert.equal(calls, 1);
    assert.equal(body.accepted, true);
    assert.equal(body.id, JOB_ID);
    assert.equal(body.status, "pending");
    assert.equal(body.retry_after_seconds, 30);
    assert.equal(body.resource, "image");
    assert.ok(String(body.note).includes("one charge"));
});

test("submit_media_job reports an already generated result without a job", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/image/generated%20already");
        (await new Response(Buffer.alloc(4), {
            status: 200,
        }).body?.cancel?.()) ?? null;
        return new Response(null, {
            status: 200,
            headers: {
                "Content-Type": "image/png",
                "Content-Length": "4096",
                "Link": `<${API_BASE}/output/cached.png>; rel="enclosure"`,
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "submit_media_job",
        arguments: { resource: "image", prompt: "generated already" },
    });
    const body = payload(result);
    assert.equal(body.accepted, false);
    assert.equal(body.already_complete, true);
    assert.equal(body.content_type, "image/png");
    assert.equal(body.size_bytes, 4096);
    assert.equal(body.media_url, `${API_BASE}/output/cached.png`);
    assert.ok(String(body.note).includes("no new charge"));
});

test("submit_media_job rejects resources that have no async jobs", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("must not fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "submit_media_job",
        arguments: { resource: "text", prompt: "hello" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /resource must be one of/);
});

test("get_media_job reads pending status and forwards Retry-After", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, `/v1/jobs/${JOB_ID}`);
        return new Response(JSON.stringify(jobPayload()), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": "7",
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_media_job",
        arguments: { job_id: JOB_ID },
    });
    const body = payload(result);
    assert.equal(body.found, true);
    assert.equal(body.state, "pending");
    assert.equal(body.status, "pending");
    assert.equal(body.retry_after_seconds, 7);
    assert.equal(body.polls, 1);
    assert.equal(body.created_at, "2026-10-23T00:00:00.000Z");
    assert.ok(String(body.note).includes("never charges again"));
});

test("get_media_job reads unknown ids as not_found", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("not found", { status: 404 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_media_job",
        arguments: { job_id: JOB_ID },
    });
    const body = payload(result);
    assert.equal(body.found, false);
    assert.equal(body.state, "not_found");
    assert.equal(body.id, JOB_ID);
    assert.ok(String(body.note).includes("24 hours"));
});

test("wait_media_job returns one free check with max_wait_seconds 0", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return new Response(JSON.stringify(jobPayload()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "wait_media_job",
        arguments: { job_id: JOB_ID, max_wait_seconds: 0 },
    });
    const body = payload(result);
    assert.equal(calls, 1);
    assert.equal(body.polls, 1);
    assert.equal(body.state, "pending");
    assert.equal(body.timed_out, true);
    assert.ok(String(body.note).includes("keeps running"));
});

test("wait_media_job polls with the server's Retry-After until the job finishes", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls++;
        if (calls === 1) {
            return new Response(JSON.stringify(jobPayload()), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": "1",
                },
            });
        }
        return new Response(
            JSON.stringify(
                jobPayload({
                    status: "succeeded",
                    completed_at: "2026-10-23T00:00:03.000Z",
                    expires_at: "2026-10-24T00:00:03.000Z",
                }),
            ),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    });
    const client = await connectClient();
    t.after(() => client.close());
    const startedAt = Date.now();
    const result = await client.callTool({
        name: "wait_media_job",
        arguments: {
            job_id: JOB_ID,
            max_wait_seconds: 30,
            poll_interval_seconds: 1,
        },
    });
    const body = payload(result);
    assert.equal(calls, 2);
    assert.equal(bodyPolls(body), 2);
    assert.equal(body.state, "succeeded");
    assert.equal(body.timed_out, false);
    assert.equal(body.completed_at, "2026-10-23T00:00:03.000Z");
    assert.equal(
        body.available_at ?? body.expires_at,
        "2026-10-24T00:00:03.000Z",
    );
    assert.ok(Date.now() - startedAt >= 900, "honoured Retry-After");
});

function bodyPolls(body) {
    return body.polls;
}

test("wait_media_job validates its budgets", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("must not fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());
    const badRange = await client.callTool({
        name: "wait_media_job",
        arguments: { job_id: JOB_ID, max_wait_seconds: 301 },
    });
    assert.equal(badRange.isError, true);
    assert.match(badRange.content[0].text, /between 0 and 300/);

    const badId = await client.callTool({
        name: "get_media_job",
        arguments: { job_id: "nope" },
    });
    assert.equal(badId.isError, true);
    assert.match(badId.content[0].text, /64 lowercase hex/);
});

test("download_media_job_result answers pending results with state, never a file", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, `/v1/jobs/${JOB_ID}/result`);
        return new Response(JSON.stringify(jobPayload()), {
            status: 409,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": "12",
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "download_media_job_result",
        arguments: { job_id: JOB_ID },
    });
    const body = payload(result);
    assert.equal(result.content.length, 1);
    assert.equal(body.delivered, false);
    assert.equal(body.state, "pending");
    assert.equal(body.retry_after_seconds, 12);
});

test("download_media_job_result inlines a small finished image", async (t) => {
    const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
    );
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(png, {
                status: 200,
                headers: {
                    "Content-Type": "image/png",
                    "Content-Length": String(png.length),
                    "Link": `<${API_BASE}/output/final.png>; rel="enclosure"`,
                },
            }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "download_media_job_result",
        arguments: { job_id: JOB_ID },
    });
    const body = payload(result);
    assert.equal(body.delivered, true);
    assert.equal(body.state, "succeeded");
    assert.equal(body.content_type, "image/png");
    assert.equal(body.size_bytes, png.length);
    assert.equal(body.media_url, `${API_BASE}/output/final.png`);
    assert.equal(result.content[1]?.type, "image");
    assert.equal(result.content[1]?.mimeType, "image/png");
    assert.equal(result.content[1]?.data, png.toString("base64"));
});

test("download_media_job_result falls back to media_url past max_bytes", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return new Response(Buffer.alloc(8), {
            status: 200,
            headers: {
                "Content-Type": "video/mp4",
                "Content-Length": "6000000",
                "Link": `<${API_BASE}/output/clip.mp4>; rel="enclosure"`,
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "download_media_job_result",
        arguments: { job_id: JOB_ID, max_bytes: 1000 },
    });
    const body = payload(result);
    assert.equal(calls, 1);
    assert.equal(body.delivered, false);
    assert.equal(body.state, "succeeded");
    assert.equal(body.content_type, "video/mp4");
    assert.equal(body.size_bytes, 6000000);
    assert.equal(body.media_url, `${API_BASE}/output/clip.mp4`);
    assert.ok(String(body.note).includes("max_bytes"));
    assert.equal(result.content.length, 1);
});
