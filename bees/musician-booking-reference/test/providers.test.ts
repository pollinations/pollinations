import assert from "node:assert/strict";
import test from "node:test";
import { createMusicianBookingAgent } from "../src/agent.js";
import { handleAgentCoreRequest } from "../src/providers/aws/index.js";
import { createEnterByopAuthorizer } from "../src/providers/enter/index.js";
import { handleBeeRequest } from "../src/runtime/index.js";

const now = new Date("2026-06-01T10:00:00.000Z");

test("AgentCore provider handles ping and invocations", async () => {
    const ping = await handleAgentCoreRequest(
        new Request("http://agentcore.local/ping"),
    );
    const invocation = await handleAgentCoreRequest(
        new Request("http://agentcore.local/invocations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                session_id: "session_1",
                prompt:
                    "Quote a jazz trio for 120 guests in Berlin on 2026-07-18. Contact alex@example.test",
            }),
        }),
        { agent: createMusicianBookingAgent(), now },
    );
    const body = (await invocation.json()) as {
        metadata: { booking_status: string; quote_total: number };
        response: string;
        session_id: string;
    };

    assert.equal(ping.status, 200);
    assert.equal(invocation.status, 200);
    assert.equal(body.session_id, "session_1");
    assert.equal(body.metadata.booking_status, "quoted");
    assert.equal(body.metadata.quote_total, 1980);
    assert.match(body.response, /Jazz trio/);
});

test("Enter BYOP authorizer returns 402 without a key and resolves userinfo", async () => {
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(url), "https://enter.example.test/api/device/userinfo");
        assert.equal(init?.headers instanceof Headers, false);
        return new Response(
            JSON.stringify({ sub: "user_from_enter", preferred_username: "demo" }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    };
    const authorize = createEnterByopAuthorizer({
        enterBaseUrl: "https://enter.example.test",
        clientId: "pk_demo",
        redirectUri: "https://bee.example.test/callback",
        fetcher,
    });

    const denied = await handleBeeRequest(
        new Request("https://bee.example.test/web/messages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: "What packages are available?" }),
        }),
        { agent: createMusicianBookingAgent(), authorize, now },
    );
    const allowed = await handleBeeRequest(
        new Request("https://bee.example.test/web/messages", {
            method: "POST",
            headers: {
                authorization: "Bearer sk_demo",
                "content-type": "application/json",
            },
            body: JSON.stringify({ text: "What packages are available?" }),
        }),
        { agent: createMusicianBookingAgent(), authorize, now },
    );

    assert.equal(denied.status, 402);
    assert.match(
        denied.headers.get("x-pollinations-authorize-url") ?? "",
        /client_id=pk_demo/,
    );
    assert.equal(allowed.status, 200);
});
