import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "@/env.ts";
import worker from "../src/index.ts";
import { createA2aRoutes } from "../src/routes/a2a.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

const ORIGIN = "https://staging.gen.pollinations.ai";

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

function send(body: unknown) {
    return fetchWorker("/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

function request(method: string, params?: unknown, id: unknown = 1) {
    return {
        jsonrpc: "2.0",
        id,
        method,
        ...(params === undefined ? {} : { params }),
    };
}

function userMessage(text: string, extra: Record<string, unknown> = {}) {
    return {
        messageId: "client-message-1",
        role: "ROLE_USER",
        parts: [{ text }],
        ...extra,
    };
}

type AgentMessage = {
    messageId: string;
    contextId: string;
    role: string;
    parts: Record<string, unknown>[];
};

describe("A2A AgentCard", () => {
    it("serves a v1.0 AgentCard at the well-known path", async () => {
        const res = await fetchWorker("/.well-known/agent-card.json");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/json");
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
        const card = (await res.json()) as {
            name: string;
            version: string;
            supportedInterfaces: Record<string, unknown>[];
            capabilities: Record<string, unknown>;
            securitySchemes: Record<
                string,
                { httpAuthSecurityScheme: { scheme: string } }
            >;
            securityRequirements: unknown[];
            defaultInputModes: string[];
            defaultOutputModes: string[];
            skills: {
                id: string;
                name: string;
                description: string;
                tags: string[];
            }[];
        };
        expect(card.name).toBe("Pollinations");
        expect(card.version).toBeTruthy();
        expect(card.supportedInterfaces).toEqual([
            {
                url: `${ORIGIN}/a2a`,
                protocolBinding: "JSONRPC",
                protocolVersion: "1.0",
            },
        ]);
        expect(card.capabilities).toMatchObject({
            streaming: false,
            pushNotifications: false,
        });
        expect(card.securitySchemes.bearer.httpAuthSecurityScheme.scheme).toBe(
            "bearer",
        );
        expect(card.securityRequirements).toEqual([
            { schemes: { bearer: {} } },
        ]);
        expect(card.defaultInputModes).toEqual(["text/plain"]);
        expect(card.defaultOutputModes).toEqual(["text/plain", "image/png"]);
        // id, name, description and tags are required on every skill.
        expect(card.skills.map((skill) => skill.id)).toEqual(["text", "image"]);
        for (const skill of card.skills) {
            expect(skill.name).toBeTruthy();
            expect(skill.description).toBeTruthy();
            expect(skill.tags.length).toBeGreaterThan(0);
        }
    });

    it("revalidates the card with an ETag", async () => {
        const first = await fetchWorker("/.well-known/agent-card.json");
        const etag = first.headers.get("ETag");
        expect(etag).toBeTruthy();
        const cached = await fetchWorker("/.well-known/agent-card.json", {
            headers: { "If-None-Match": etag ?? "" },
        });
        expect(cached.status).toBe(304);
    });
});

describe("POST /a2a", () => {
    it("answers ping without authentication", async () => {
        const res = await send(request("ping"));
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            jsonrpc: "2.0",
            id: 1,
            result: {},
        });
    });

    it("rejects a body that is not JSON with a parse error", async () => {
        const res = await send("{nope");
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700 },
        });
    });

    it("rejects batches and non-object payloads as invalid requests", async () => {
        for (const body of [[request("ping")], JSON.stringify("hi"), 42]) {
            const res = await send(body);
            expect(res.status).toBe(400);
            await expect(res.json()).resolves.toMatchObject({
                error: { code: -32600 },
            });
        }
    });

    it("rejects a request without jsonrpc 2.0 and an id", async () => {
        for (const body of [
            { id: 1, method: "ping" },
            { jsonrpc: "2.0", method: "ping" },
        ]) {
            const res = await send(body);
            expect(res.status).toBe(400);
            await expect(res.json()).resolves.toMatchObject({
                error: { code: -32600 },
            });
        }
    });

    it("reports unimplemented methods as method not found", async () => {
        const res = await send(request("tasks/get", { id: "task-1" }));
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({
            error: {
                code: -32601,
                message: expect.stringContaining("tasks/get"),
            },
        });
    });

    it("rejects invalid SendMessage params", async () => {
        const invalid = [
            userMessage("hi", { role: "ROLE_AGENT" }),
            userMessage("hi", { messageId: "" }),
            userMessage("hi", { parts: [] }),
            userMessage("hi", { parts: [{ url: "https://example.com" }] }),
            userMessage("   "),
        ];
        for (const message of invalid) {
            const res = await send(request("SendMessage", { message }));
            await expect(res.json()).resolves.toMatchObject({
                error: { code: -32602 },
            });
        }
        const badModality = await send(
            request("SendMessage", {
                message: userMessage("hi"),
                metadata: { modality: "video" },
            }),
        );
        await expect(badModality.json()).resolves.toMatchObject({
            error: {
                code: -32602,
                message: expect.stringContaining("modality"),
            },
        });
    });

    it("challenges an unauthenticated SendMessage with 401 and OAuth discovery", async () => {
        const res = await send(
            request("SendMessage", { message: userMessage("hello") }),
        );
        expect(res.status).toBe(401);
        expect(res.headers.get("WWW-Authenticate")).toContain(
            "/.well-known/oauth-protected-resource",
        );
        await expect(res.json()).resolves.toMatchObject({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000 },
        });
    });
});

describe("POST /a2a generation", () => {
    function testApp(
        dispatch: (request: Request) => Response | Promise<Response>,
    ) {
        return new Hono<Env>().route("/", createA2aRoutes(dispatch));
    }

    async function call(app: Hono<Env>, body: unknown) {
        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/a2a", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer sk_test",
                },
                body: JSON.stringify(body),
            }),
            {} as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        return response;
    }

    it("answers with the completion as an agent message", async () => {
        const requests: Request[] = [];
        const app = testApp(async (sent) => {
            requests.push(sent);
            return Response.json({
                choices: [{ message: { role: "assistant", content: "Hello" } }],
            });
        });
        const res = await call(
            app,
            request("SendMessage", { message: userMessage("Say hello") }),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            jsonrpc: string;
            id: number;
            result: { message: AgentMessage };
        };
        expect(body.jsonrpc).toBe("2.0");
        expect(body.id).toBe(1);
        const message = body.result.message;
        expect(message.role).toBe("ROLE_AGENT");
        expect(message.messageId).toBeTruthy();
        expect(message.contextId).toBeTruthy();
        expect(message.parts).toEqual([{ text: "Hello" }]);
        // The dispatch ran as a Chat Completions request with the caller's headers.
        const dispatched = requests[0];
        expect(new URL(dispatched.url).pathname).toBe("/v1/chat/completions");
        expect(dispatched.headers.get("Authorization")).toBe("Bearer sk_test");
        await expect(dispatched.json()).resolves.toEqual({
            messages: [{ role: "user", content: "Say hello" }],
            stream: false,
        });
    });

    it("keeps the client's context id on the reply", async () => {
        const app = testApp(() =>
            Response.json({ choices: [{ message: { content: "Hi" } }] }),
        );
        const res = await call(
            app,
            request("SendMessage", {
                message: userMessage("hi", { contextId: "context-7" }),
            }),
        );
        const body = (await res.json()) as {
            result: { message: AgentMessage };
        };
        expect(body.result.message.contextId).toBe("context-7");
    });

    it("generates an image when metadata selects the image modality", async () => {
        const requests: Request[] = [];
        const app = testApp(async (sent) => {
            requests.push(sent);
            return Response.json({
                data: [
                    {
                        url: "https://media.pollinations.ai/abc",
                        media_type: "image/png",
                    },
                ],
            });
        });
        const res = await call(
            app,
            request("SendMessage", {
                message: userMessage("a tiny watercolor bee"),
                metadata: { modality: "image" },
            }),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            result: { message: AgentMessage };
        };
        expect(body.result.message.parts).toEqual([
            {
                url: "https://media.pollinations.ai/abc",
                mediaType: "image/png",
            },
        ]);
        expect(new URL(requests[0].url).pathname).toBe(
            "/v1/images/generations",
        );
        await expect(requests[0].json()).resolves.toEqual({
            prompt: "a tiny watercolor bee",
            n: 1,
            response_format: "url",
        });
    });

    it("keeps the upstream HTTP status when generation fails", async () => {
        const app = testApp(
            () =>
                new Response(
                    JSON.stringify({
                        success: false,
                        error: { message: "Insufficient balance" },
                    }),
                    { status: 402 },
                ),
        );
        const res = await call(
            app,
            request("SendMessage", { message: userMessage("hi") }),
        );
        expect(res.status).toBe(402);
        await expect(res.json()).resolves.toMatchObject({
            id: 1,
            error: { code: -32000, message: "Insufficient balance" },
        });
    });

    it("maps a generation payload without results to a 502", async () => {
        const noCompletion = testApp(() => Response.json({ choices: [] }));
        const completion = await call(
            noCompletion,
            request("SendMessage", { message: userMessage("hi") }),
        );
        expect(completion.status).toBe(502);
        await expect(completion.json()).resolves.toMatchObject({
            error: { code: -32603 },
        });

        const noImage = testApp(() => Response.json({ data: [] }));
        const image = await call(
            noImage,
            request("SendMessage", {
                message: userMessage("hi"),
                metadata: { modality: "image" },
            }),
        );
        expect(image.status).toBe(502);
        await expect(image.json()).resolves.toMatchObject({
            error: { code: -32603 },
        });
    });
});
