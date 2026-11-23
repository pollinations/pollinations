import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { expect, vi } from "vitest";
import worker from "../src/index.ts";

type WebSocketResponse = Response & { webSocket?: WebSocket };

/**
 * Wave 8 bug 28: gpt-realtime sessions leak the internal Azure deployment
 * id in session.model. The client asked for openai/gpt-realtime-2.1; the
 * forwarded session.created says "gpt-realtime-2-1", which is not a name
 * any caller can request. Every other surface rewrites provider ids to the
 * registry's public identity.
 */
test("realtime session events report the public model, not the deployment", async () => {
    const { key } = await createTestApiKey({
        name: "gpt-realtime-identity-key",
        pollenBudget: 1,
        user: { tierBalance: 1, packBalance: 0 },
    });

    let upstreamServer: WebSocket | undefined;
    let upstreamClient: WebSocket | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.url.includes("/v0/events?name=generation_event_v2")) {
            return new Response("", { status: 202 });
        }
        if (request.url.includes("public_model_stats.json")) {
            return Response.json({ data: [] });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
        upstreamClient = client;
        upstreamServer = server;
        server.accept();
        // Exactly the live session.created from the Azure deployment: the
        // internal deployment name in session.model.
        server.send(
            JSON.stringify({
                type: "session.created",
                event_id: "event_created",
                session: {
                    type: "realtime",
                    object: "realtime.session",
                    id: "sess_test",
                    model: "gpt-realtime-2-1",
                    output_modalities: ["audio"],
                    instructions: "You are a helpful assistant.",
                    expires_at: 1792145818,
                },
            }),
        );
        return new Response(null, {
            status: 101,
            webSocket: client,
        }) as WebSocketResponse;
    });

    const ctx = createExecutionContext();
    const response = (await worker.fetch(
        new Request(
            "https://gen.pollinations.ai/v1/realtime?model=openai/gpt-realtime-2.1",
            {
                headers: {
                    Authorization: `Bearer ${key}`,
                    Upgrade: "websocket",
                },
            },
        ),
        env,
        ctx,
    )) as WebSocketResponse;
    expect(response.status).toBe(101);

    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();

    const created = (await new Promise((resolve) => {
        client.addEventListener(
            "message",
            (event) => resolve(JSON.parse(String(event.data))),
            { once: true },
        );
        (upstreamServer as WebSocket).send(
            JSON.stringify({
                type: "session.updated",
                event_id: "event_updated",
                session: {
                    type: "realtime",
                    model: "gpt-realtime-2-1",
                    voice: "alloy",
                },
            }),
        );
        setTimeout(() => resolve(JSON.parse('{"type":"timeout"}')), 2000);
    })) as Record<string, unknown>;

    expect(created.type).toBe("session.created");
    expect((created.session as Record<string, unknown>)?.model).toBe(
        "openai/gpt-realtime-2.1",
    );

    const updated = (await new Promise((resolve) => {
        client.addEventListener("message", (event) => {
            const parsed = JSON.parse(String(event.data));
            if (parsed.type === "session.updated") resolve(parsed);
        });
        setTimeout(() => resolve(JSON.parse('{"type":"timeout"}')), 2000);
    })) as Record<string, unknown>;

    expect(updated.type).toBe("session.updated");
    expect((updated.session as Record<string, unknown>)?.model).toBe(
        "openai/gpt-realtime-2.1",
    );

    client.close();
    (upstreamClient as WebSocket).close();
    await waitOnExecutionContext(ctx);
});
