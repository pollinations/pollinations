import {
    A2A_CONTENT_TYPE,
    A2A_PROTOCOL_VERSION,
    A2A_VERSION_HEADER,
    AgentCard,
    Message,
    Role,
    SendMessageRequest,
} from "@a2a-js/sdk";
import {
    ContentTypeNotSupportedError,
    PushNotificationNotSupportedError,
    RequestMalformedError,
    TaskNotFoundError,
    toJsonRpcError,
    VersionNotSupportedError,
} from "@a2a-js/sdk/errors";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    CreateChatCompletionRequestSchema,
    CreateChatCompletionResponseSchema,
} from "@shared/schemas/openai.ts";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { A2aJsonRpcRequest, Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { resolveModelDefinition } from "@/middleware/model.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import {
    applySafetyToChatRequest,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import { track } from "@/middleware/track.ts";
import { handleChatCompletionLocal } from "@/text/handler.ts";
import { generationAccess } from "@/utils/generation-access.ts";
import {
    type GenerationModelEntry,
    getGenerationModelRegistry,
} from "../model-registry.ts";
import { textBodyLimit } from "./generation-handlers.ts";

export function agentCardUrl(origin: string, modelId: string): string {
    const [owner, ...nameParts] = modelId.split("/");
    return `${origin}/a2a/agents/${encodeURIComponent(owner)}/${encodeURIComponent(nameParts.join("/"))}/agent-card.json`;
}

export function buildAgentCard(
    entry: GenerationModelEntry,
    origin: string,
): AgentCard {
    const endpoint = entry.communityEndpoint;
    if (!endpoint || !entry.info.agent) {
        throw new Error(`${entry.id} is not an agent listing`);
    }
    const description = entry.info.description || entry.info.title;
    const provider =
        endpoint.providerName && endpoint.providerUrl
            ? {
                  organization: endpoint.providerName,
                  url: endpoint.providerUrl,
              }
            : undefined;

    return {
        name: entry.info.title,
        description,
        supportedInterfaces: [
            {
                url: `${origin}/a2a`,
                protocolBinding: "JSONRPC",
                protocolVersion: A2A_PROTOCOL_VERSION,
                tenant: entry.id,
            },
        ],
        provider,
        version: "1.0.0",
        capabilities: {
            streaming: false,
            pushNotifications: false,
            extendedAgentCard: false,
            extensions: [],
        },
        securitySchemes: {
            pollinationsApiKey: {
                scheme: {
                    $case: "httpAuthSecurityScheme",
                    value: {
                        description:
                            "Pollinations API key from https://enter.pollinations.ai/keys",
                        scheme: "Bearer",
                        bearerFormat: "Pollinations API key",
                    },
                },
            },
        },
        securityRequirements: [
            { schemes: { pollinationsApiKey: { list: [] } } },
        ],
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        skills: [
            {
                id: entry.id.replace(/[^a-zA-Z0-9_-]/g, "-"),
                name: entry.info.title,
                description,
                tags: ["assistant"],
                examples: [],
                inputModes: [],
                outputModes: [],
                securityRequirements: [],
            },
        ],
        signatures: [],
    };
}

function jsonRpcError(id: A2aJsonRpcRequest["id"], error: unknown): Response {
    return Response.json(
        { jsonrpc: "2.0", id, error: toJsonRpcError(error) },
        {
            headers: {
                [A2A_VERSION_HEADER]: A2A_PROTOCOL_VERSION,
                "Content-Type": A2A_CONTENT_TYPE,
            },
        },
    );
}

function parseJsonRpcRequest(value: unknown): A2aJsonRpcRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RequestMalformedError("Invalid JSON-RPC request");
    }
    const request = value as Record<string, unknown>;
    if (
        request.jsonrpc !== "2.0" ||
        request.method !== "SendMessage" ||
        !(
            typeof request.id === "string" ||
            typeof request.id === "number" ||
            request.id === null
        )
    ) {
        throw new RequestMalformedError(
            "Only A2A v1 SendMessage requests are supported",
        );
    }
    return request as A2aJsonRpcRequest;
}

function requestTenant(request: A2aJsonRpcRequest): string {
    const params = request.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) {
        throw new RequestMalformedError("SendMessage params are required");
    }
    const tenant = (params as Record<string, unknown>).tenant;
    if (typeof tenant !== "string" || !tenant.trim()) {
        throw new RequestMalformedError(
            "SendMessage params.tenant is required",
        );
    }
    return tenant;
}

const resolveA2aAgent = createMiddleware<Env>(async (c, next) => {
    let request: A2aJsonRpcRequest;
    try {
        request = parseJsonRpcRequest(await c.req.raw.clone().json());
    } catch (error) {
        return jsonRpcError(null, error);
    }

    const requestedVersion = c.req.header(A2A_VERSION_HEADER);
    if (requestedVersion !== A2A_PROTOCOL_VERSION) {
        return jsonRpcError(
            request.id,
            new VersionNotSupportedError(
                `Use A2A-Version: ${A2A_PROTOCOL_VERSION}`,
            ),
        );
    }

    let tenant: string;
    try {
        tenant = requestTenant(request);
    } catch (error) {
        return jsonRpcError(request.id, error);
    }

    const registry = await getGenerationModelRegistry(c.env);
    const entry = registry
        .visibleEntries(c.var.auth.user?.id)
        .find((candidate) => candidate.id === tenant && candidate.info.agent);
    if (!entry) {
        return jsonRpcError(
            request.id,
            new RequestMalformedError("Unknown agent tenant"),
        );
    }

    c.set("a2aRequest", request);
    c.set(
        "model",
        await resolveModelDefinition(
            entry.id,
            "generate.text",
            c.env,
            c.var.auth.user?.id,
        ),
    );
    await next();
});

function userText(params: ReturnType<typeof SendMessageRequest.fromJSON>) {
    const message = params.message;
    if (!message || message.role !== Role.ROLE_USER) {
        throw new RequestMalformedError("A user message is required");
    }
    if (message.taskId) {
        throw new TaskNotFoundError("This stateless agent has no saved tasks");
    }
    if (params.configuration?.taskPushNotificationConfig) {
        throw new PushNotificationNotSupportedError();
    }
    if (
        params.configuration?.acceptedOutputModes.length &&
        !params.configuration.acceptedOutputModes.includes("text/plain")
    ) {
        throw new ContentTypeNotSupportedError("This agent returns text/plain");
    }

    return {
        message,
        text: message.parts
            .map((part) => {
                if (
                    part.content?.$case !== "text" ||
                    (part.mediaType && part.mediaType !== "text/plain")
                ) {
                    throw new ContentTypeNotSupportedError(
                        "This agent accepts text/plain parts",
                    );
                }
                return part.content.value;
            })
            .join("\n"),
    };
}

async function invokeAgent(
    c: Context<Env>,
    params: ReturnType<typeof SendMessageRequest.fromJSON>,
): Promise<{ message: Message; headers: Headers }> {
    const { message, text } = userText(params);
    if (!text.trim()) {
        throw new RequestMalformedError("Message text is required");
    }

    const requestBody = await applySafetyToChatRequest(
        c,
        CreateChatCompletionRequestSchema.parse({
            model: c.var.model.resolved,
            messages: [{ role: "user", content: text }],
            stream: false,
        }),
    );
    const response = await handleChatCompletionLocal(c, requestBody);
    const responseBody = await response.clone().json();
    if (!response.ok) {
        throw new Error(
            typeof responseBody === "object" &&
                responseBody !== null &&
                "error" in responseBody
                ? JSON.stringify(responseBody.error)
                : `Agent request failed with HTTP ${response.status}`,
        );
    }
    const completion = CreateChatCompletionResponseSchema.parse(responseBody);
    const content = completion.choices[0]?.message?.content || "";

    return {
        headers: response.headers,
        message: {
            messageId: crypto.randomUUID(),
            contextId: message.contextId || crypto.randomUUID(),
            taskId: "",
            role: Role.ROLE_AGENT,
            parts: [
                {
                    content: { $case: "text", value: content },
                    mediaType: "text/plain",
                    filename: "",
                    metadata: undefined,
                },
            ],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
        },
    };
}

async function handleA2aRequest(c: Context<Env>): Promise<Response> {
    const request = c.var.a2aRequest;
    try {
        const params = SendMessageRequest.fromJSON(request.params);
        const { message, headers } = await invokeAgent(c, params);
        headers.set(A2A_VERSION_HEADER, A2A_PROTOCOL_VERSION);
        headers.set("Content-Type", A2A_CONTENT_TYPE);
        return withSafetyHeaders(
            c,
            Response.json(
                {
                    jsonrpc: "2.0",
                    id: request.id,
                    result: { message: Message.toJSON(message) },
                },
                { headers },
            ),
        );
    } catch (error) {
        return jsonRpcError(request.id, error);
    }
}

export const a2aRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("/agents/*", auth())
    .get("/agents/:owner/:name/agent-card.json", async (c) => {
        const modelId = `${c.req.param("owner")}/${c.req.param("name")}`;
        const entry = (await getGenerationModelRegistry(c.env))
            .visibleEntries(c.var.auth.user?.id)
            .find((candidate) => candidate.id === modelId);
        if (!entry?.info.agent) return c.notFound();

        return Response.json(
            AgentCard.toJSON(buildAgentCard(entry, getPublicOrigin(c))),
            { headers: { "Content-Type": A2A_CONTENT_TYPE } },
        );
    })
    .use("*", auth())
    .use("*", frontendKeyRateLimit)
    .use("*", balance)
    .post(
        "/",
        textBodyLimit,
        resolveA2aAgent,
        track("generate.text"),
        generationAccess,
        handleA2aRequest,
    );
