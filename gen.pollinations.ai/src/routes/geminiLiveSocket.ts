import type { Usage } from "@shared/registry/registry.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import googleCloudAuth from "@/text/auth/googleCloudAuth.ts";
import { syncTextEnvironment } from "@/text/environment.ts";
import {
    type FallbackCandidate,
    fallbackCandidates,
    withModelFallback,
} from "../fallback.ts";
import { createGeminiLiveEvents } from "./geminiLiveEvents.ts";

export const GEMINI_LIVE = "google/gemini-3.8-live";
const GEMINI_US = "google/gemini-3.8-live:google:us";

async function route(c: Context<Env>, id: string) {
    const us = id === GEMINI_US;
    const location = us ? "us" : "us-central1";
    const host = us
        ? "aiplatform.us.rep.googleapis.com"
        : "us-central1-aiplatform.googleapis.com";
    syncTextEnvironment(c.env);
    const token = await googleCloudAuth.getAccessToken();
    if (!token) throw new Error("Gemini Live route unavailable");
    return {
        url: `https://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`,
        headers: new Headers({ Authorization: `Bearer ${token}` }),
        model: `projects/${c.env.GOOGLE_PROJECT_ID}/locations/${location}/publishers/google/models/gemini-3.8-live`,
    };
}

export function proxyGeminiLive(
    c: Context<Env>,
    billing: {
        select: (candidate: FallbackCandidate) => void;
        usage: (usage: Usage) => void;
        settle: () => void;
    },
): Response {
    const [client, downstream] = Object.values(new WebSocketPair()) as [
        WebSocket,
        WebSocket,
    ];
    const lifetime = new AbortController();
    let selected: WebSocket | undefined;
    let started = false;
    let disconnected = false;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    // Only one bounded turn can await setup. Session configuration is sent in setup itself.
    const queue: string[] = [];
    const sendClient = (event: object) => {
        if (!disconnected && downstream.readyState === WebSocket.OPEN)
            downstream.send(JSON.stringify(event));
    };
    const finish = (message?: string) => {
        if (lifetime.signal.aborted) return;
        clearTimeout(drainTimer);
        lifetime.abort();
        queue.length = 0;
        if (message) {
            c.get("log")
                .getChild("realtime")
                .error("Gemini Live session failed: {message}", { message });
            sendClient({
                type: "error",
                event_id: `event_${crypto.randomUUID()}`,
                error: {
                    type: "server_error",
                    code: "provider_error",
                    message,
                },
            });
        }
        if (selected?.readyState === WebSocket.OPEN) selected.close();
        if (downstream.readyState !== WebSocket.CLOSED)
            downstream.close(message ? 1011 : 1000, message);
        billing.settle();
    };

    const events = createGeminiLiveEvents({
        model: GEMINI_LIVE,
        sendClient,
        onUsage: billing.usage,
        cancelUnsentTurn() {
            if (selected) return false;
            queue.length = 0;
            return true;
        },
        sendGoogle(event) {
            if (lifetime.signal.aborted) return;
            const frame = JSON.stringify(event);
            if (selected) selected.send(frame);
            else queue.push(frame);
        },
        requestSetup() {
            if (started) return;
            started = true;
            const candidates = fallbackCandidates(c.var.model).filter(
                ({ id }) => id === GEMINI_LIVE || id === GEMINI_US,
            );
            c.executionCtx.waitUntil(
                withModelFallback(
                    candidates,
                    connect,
                    undefined,
                    undefined,
                    () => !selected && !lifetime.signal.aborted,
                ).catch(() =>
                    finish("Unable to establish a Gemini Live session"),
                ),
            );
        },
    });

    async function connect(candidate: FallbackCandidate) {
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(), 10_000);
        const signal = AbortSignal.any([lifetime.signal, deadline.signal]);
        try {
            // Bound token refresh as well as the WebSocket upgrade and setup.
            const aborted = new Promise<never>((_, reject) => {
                if (signal.aborted)
                    reject(new Error("Gemini Live setup aborted"));
                else
                    signal.addEventListener(
                        "abort",
                        () => reject(new Error("Gemini Live setup aborted")),
                        { once: true },
                    );
            });
            await Promise.race([handshake(candidate, signal), aborted]);
        } finally {
            clearTimeout(timer);
        }
    }

    async function handshake(
        candidate: FallbackCandidate,
        signal: AbortSignal,
    ) {
        const { url, headers, model } = await route(c, candidate.id);
        signal.throwIfAborted();
        headers.set("Upgrade", "websocket");
        const response = await fetch(url, { headers, signal });
        const socket = response.webSocket;
        if (!socket) {
            await response.body?.cancel();
            throw new Error("Gemini Live upgrade failed");
        }
        // No content leaves the queue until Google acknowledges setup. After that
        // point a disconnect belongs to this session and can never trigger replay.
        await new Promise<void>((resolve, reject) => {
            let ready = false;
            let failed = false;
            const failSetup = () => {
                if (failed || ready) return;
                failed = true;
                signal.removeEventListener("abort", failSetup);
                if (socket.readyState === WebSocket.OPEN) socket.close();
                reject(new Error("Gemini Live setup failed"));
            };
            const providerClosed = () => {
                if (!ready) return failSetup();
                finish(
                    events.pendingTurn()
                        ? "Gemini Live ended before terminal usage"
                        : undefined,
                );
            };
            socket.binaryType = "arraybuffer";
            socket.addEventListener("close", providerClosed);
            socket.addEventListener("error", () => {
                if (!ready) return failSetup();
                finish("Gemini Live connection failed");
            });
            socket.addEventListener("message", ({ data }) => {
                if (failed || lifetime.signal.aborted) return;
                try {
                    const frame = JSON.parse(
                        typeof data === "string"
                            ? data
                            : new TextDecoder().decode(data),
                    );
                    if (!ready) {
                        if (!frame?.setupComplete) return failSetup();
                        billing.select(candidate);
                        selected = socket;
                        ready = true;
                        signal.removeEventListener("abort", failSetup);
                        resolve();
                        for (const payload of queue) socket.send(payload);
                        queue.length = 0;
                    } else {
                        events.google(frame);
                        if (disconnected && !events.pendingTurn()) finish();
                    }
                } catch {
                    if (!ready) return failSetup();
                    finish(
                        "Gemini Live returned an invalid response or incomplete usage",
                    );
                }
            });
            socket.accept();
            signal.addEventListener("abort", failSetup, { once: true });
            if (signal.aborted) return failSetup();
            try {
                socket.send(JSON.stringify(events.setup(model)));
            } catch {
                failSetup();
            }
        });
    }

    const disconnect = () => {
        if (disconnected || lifetime.signal.aborted) return;
        disconnected = true;
        if (selected && events.pendingTurn()) {
            // Give Google a bounded opportunity to send usage for an in-flight turn.
            c.executionCtx.waitUntil(
                new Promise<void>((resolve) => {
                    lifetime.signal.addEventListener("abort", () => resolve(), {
                        once: true,
                    });
                    drainTimer = setTimeout(
                        () => finish("Gemini Live ended before terminal usage"),
                        15_000,
                    );
                }),
            );
        } else finish();
    };
    downstream.addEventListener("close", disconnect);
    downstream.addEventListener("error", disconnect);
    downstream.addEventListener("message", ({ data }) => {
        if (disconnected || lifetime.signal.aborted) return;
        try {
            events.client(typeof data === "string" ? JSON.parse(data) : null);
        } catch {
            finish("Invalid Gemini Live realtime frame");
        }
    });
    downstream.accept({ allowHalfOpen: true });
    events.start();
    return new Response(null, { status: 101, webSocket: client });
}
