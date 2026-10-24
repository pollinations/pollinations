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
 * Wave 8 bug 27: a gpt-live-transcribe session that never receives a
 * client session.update streams audio into a transcription-disabled session
 * (the deployment's session.created reports audio.input.transcription: null).
 * The client gets no transcripts and the session settles with zero usage,
 * because billing reads only the usage that rides on
 * conversation.item.input_audio_transcription.* events.
 *
 * Expected behavior (matches OpenAI transcription sessions and the live
 * session.update flow): the proxy enables transcription by default on
 * connect, so a default session transcribes and reports usage.
 */
test("gpt-live-transcribe enables transcription by default on connect", async () => {
    const { key } = await createTestApiKey({
        name: "live-transcribe-default-key",
        pollenBudget: 1,
        user: { tierBalance: 1, packBalance: 0 },
    });

    let upstreamRequest: Request | undefined;
    let upstreamClient: WebSocket | undefined;
    let upstreamServer: WebSocket | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.url.includes("/v0/events?name=generation_event_v2")) {
            return new Response("", { status: 202 });
        }
        if (request.url.includes("public_model_stats.json")) {
            return Response.json({ data: [] });
        }
        upstreamRequest = request;
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
        upstreamClient = client;
        upstreamServer = server;
        // The real deployment's session.created: a transcription session with
        // transcription DISABLED by default (null), exactly as observed live.
        server.accept();
        server.send(
            JSON.stringify({
                type: "session.created",
                event_id: "event_created",
                session: {
                    type: "transcription",
                    object: "realtime.transcription_session",
                    id: "sess_test",
                    audio: {
                        input: {
                            format: { type: "audio/pcm", rate: 24000 },
                            transcription: null,
                            noise_reduction: null,
                            turn_detection: {
                                type: "server_vad",
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 200,
                            },
                        },
                    },
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
            "https://gen.pollinations.ai/v1/realtime?model=gpt-live-transcribe",
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
    expect(upstreamRequest?.url).toBe(
        "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/realtime?intent=transcription",
    );

    const client = response.webSocket;
    if (!client) throw new Error("Expected downstream WebSocket");
    client.accept();
    const server = upstreamServer as WebSocket;

    // The proxy must enable transcription on the upstream without waiting for
    // a client session.update. Collect the first message the upstream server
    // receives from the proxy.
    const proxiedEvent = new Promise<unknown>((resolve) => {
        server.addEventListener(
            "message",
            (event) => resolve(JSON.parse(String(event.data))),
            { once: true },
        );
    });

    // A default client: streams audio without any session.update.
    client.send(
        JSON.stringify({
            type: "input_audio_buffer.append",
            audio: btoa("\0".repeat(4800)),
        }),
    );

    const proxied = (await Promise.race([
        proxiedEvent,
        new Promise((_, reject) =>
            setTimeout(
                () =>
                    reject(new Error("no session.update reached the provider")),
                2000,
            ),
        ),
    ])) as Record<string, unknown>;
    expect(proxied.type).toBe("session.update");
    expect(proxied).toMatchObject({
        session: {
            audio: {
                input: {
                    transcription: { model: "test-gpt-live-transcribe" },
                },
            },
        },
    });

    // The provider echoes the applied session with the deployment name, which
    // the transcription-path transform rewrites to the public model, so
    // clients can see transcription is on.
    const clientEcho = new Promise<unknown>((resolve) => {
        client.addEventListener("message", (event) => {
            const parsed = JSON.parse(String(event.data));
            if (parsed.type === "session.updated") resolve(parsed);
        });
    });
    server.send(
        JSON.stringify({
            type: "session.updated",
            event_id: "event_updated",
            session: {
                type: "transcription",
                audio: {
                    input: {
                        format: { type: "audio/pcm", rate: 24000 },
                        transcription: { model: "test-gpt-live-transcribe" },
                        noise_reduction: null,
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 200,
                        },
                    },
                },
            },
        }),
    );

    // The provider's echo reaches the client with the PUBLIC model name, so
    // clients can also see that transcription is on.
    const echo = (await Promise.race([
        clientEcho,
        new Promise((_, reject) =>
            setTimeout(
                () =>
                    reject(new Error("no session.updated reached the client")),
                2000,
            ),
        ),
    ])) as Record<string, unknown>;
    expect(echo).toMatchObject({
        type: "session.updated",
        session: {
            audio: {
                input: {
                    transcription: { model: "openai/gpt-live-transcribe" },
                },
            },
        },
    });

    client.close();
    (upstreamClient as WebSocket).close();
    await waitOnExecutionContext(ctx);
});
