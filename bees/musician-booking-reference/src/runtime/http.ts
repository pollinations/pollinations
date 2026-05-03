import type { MusicianBookingAgent } from "../agent.js";
import { createMusicianBookingAgent } from "../agent.js";
import {
    createA2AAgentCard,
    handleA2AMessageSend,
    handleDiscordMessage,
    handleOpenAIChatCompletion,
    handleWebMessage,
    toServerSentEvents,
    type A2AJsonRpcRequest,
    type DiscordMessageInput,
    type OpenAIChatCompletionRequest,
    type WebMessageInput,
} from "../surfaces/index.js";

export type BeeRuntimeOptions = {
    agent?: MusicianBookingAgent;
    authorize?: (
        context: BeeRequestContext,
    ) => BeeAuthorization | Promise<BeeAuthorization>;
    baseUrl?: string;
    now?: Date;
};

export type BeeRequestContext = {
    request: Request;
    path: string;
    surface: "a2a" | "discord" | "openai" | "web";
};

export type BeeAuthorization = {
    allowed: boolean;
    userId?: string;
    status?: number;
    reason?: string;
    headers?: Record<string, string>;
};

type WebBody = Omit<WebMessageInput, "now" | "userId"> & {
    userId?: string;
    stream?: boolean;
};

const defaultAgent = createMusicianBookingAgent();

function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

async function readJson<T>(request: Request): Promise<T> {
    try {
        return (await request.json()) as T;
    } catch {
        throw new Response("Invalid JSON", { status: 400 });
    }
}

async function authorize(
    context: BeeRequestContext,
    options: BeeRuntimeOptions,
): Promise<BeeAuthorization> {
    if (!options.authorize) return { allowed: true };
    return options.authorize(context);
}

function forbidden(auth: BeeAuthorization): Response {
    return json(
        { error: auth.reason ?? "Authorization required" },
        { status: auth.status ?? 403, headers: auth.headers },
    );
}

export async function handleBeeRequest(
    request: Request,
    options: BeeRuntimeOptions = {},
): Promise<Response> {
    const agent = options.agent ?? defaultAgent;
    const url = new URL(request.url);
    const baseUrl = options.baseUrl ?? url.origin;

    try {
        if (
            request.method === "GET" &&
            url.pathname === "/.well-known/agent-card.json"
        ) {
            return json(createA2AAgentCard(baseUrl));
        }

        if (request.method === "POST" && url.pathname === "/a2a") {
            const auth = await authorize(
                { request, path: url.pathname, surface: "a2a" },
                options,
            );
            if (!auth.allowed) return forbidden(auth);
            const body = await readJson<A2AJsonRpcRequest>(request);
            return json(
                await handleA2AMessageSend(agent, body, { now: options.now }),
            );
        }

        if (
            request.method === "POST" &&
            url.pathname === "/v1/chat/completions"
        ) {
            const auth = await authorize(
                { request, path: url.pathname, surface: "openai" },
                options,
            );
            if (!auth.allowed) return forbidden(auth);
            const body = await readJson<OpenAIChatCompletionRequest>(request);
            return json(
                await handleOpenAIChatCompletion(agent, body, {
                    now: options.now,
                    fallbackUserId: auth.userId,
                }),
            );
        }

        if (request.method === "POST" && url.pathname === "/web/messages") {
            const auth = await authorize(
                { request, path: url.pathname, surface: "web" },
                options,
            );
            if (!auth.allowed) return forbidden(auth);
            const body = await readJson<WebBody>(request);
            const reply = await handleWebMessage(agent, {
                userId: body.userId ?? auth.userId ?? "anonymous",
                text: body.text,
                now: options.now,
            });
            if (body.stream) {
                return new Response(toServerSentEvents(reply), {
                    headers: { "content-type": "text/event-stream" },
                });
            }
            return json(reply);
        }

        if (request.method === "POST" && url.pathname === "/discord/messages") {
            const auth = await authorize(
                { request, path: url.pathname, surface: "discord" },
                options,
            );
            if (!auth.allowed) return forbidden(auth);
            const body = await readJson<DiscordMessageInput>(request);
            return json(
                await handleDiscordMessage(agent, {
                    ...body,
                    now: options.now,
                }),
            );
        }
    } catch (error) {
        if (error instanceof Response) return error;
        return json({ error: "Internal error" }, { status: 500 });
    }

    return json({ error: "Not found" }, { status: 404 });
}
