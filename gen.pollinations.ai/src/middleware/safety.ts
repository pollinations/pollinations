import type {
    CreateChatCompletionRequest,
    MessageContentPart,
} from "@shared/schemas/openai.ts";
import type { SafeValue } from "@shared/schemas/safety.ts";
import {
    invalidSafeTokens,
    normalizeSafeValue,
    SAFETY_HEADER_NAME,
    VALID_SAFE_TOKENS,
} from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import {
    applyGuardrail,
    type BedrockResponse,
    resolveBedrockGuardrailEnv,
} from "@/utils/bedrock-guardrail.ts";
import {
    classifyTriggers,
    resolveRequestSafety,
} from "@/utils/safety-features.ts";

type SafetyContext = Context<Env>;
type ChatBody = CreateChatCompletionRequest & Record<string, unknown>;
type ChatMessage = ChatBody["messages"][number];
const SAFETY_HEADERS_KEY = "safetyHeaders";

export type SafetyVariables = {
    safetyHeaders?: Record<string, string>;
};

export async function applySafety(
    c: SafetyContext,
    text: string,
    bodySafe?: SafeValue,
): Promise<string> {
    const safeValue = resolveSafeValue(c, bodySafe);
    const features = getRequestFeatures(safeValue);
    if (features.size === 0 || !text.trim()) return text;

    setSafetyHeader(c, "X-Safety-Applied", [...features].join(","));

    let response: BedrockResponse;
    try {
        const guardrailEnv = resolveBedrockGuardrailEnv(c.env);
        if (!guardrailEnv) {
            setSafetyHeader(c, "X-Safety-Status", "misconfigured");
            throw safetyError(503, "service_unavailable", {
                message: "Safety service not configured",
            });
        }
        response = await applyGuardrail(text, "INPUT", guardrailEnv);
    } catch (error) {
        if (error instanceof HTTPException) throw error;
        c.get("log").error("Bedrock guardrail failed: {error}", {
            error: String(error),
        });
        setSafetyHeader(c, "X-Safety-Status", "unavailable");
        throw safetyError(503, "service_unavailable", {
            message: "Safety service temporarily unavailable",
        });
    }

    if (response.action !== "GUARDRAIL_INTERVENED") return text;

    const { blockedFeatures, redactedIds } = classifyTriggers(
        response,
        features,
    );
    if (blockedFeatures.size > 0) {
        throw safetyError(400, "content_blocked", {
            message: "Request blocked by safety filter",
            safety: {
                applied: [...features],
                triggered: [...blockedFeatures],
            },
        });
    }

    const redacted = response.outputs?.[0]?.text;
    if (features.has("privacy") && redacted && redacted !== text) {
        if (redactedIds.length > 0) {
            setSafetyHeader(c, "X-Safety-Redacted", redactedIds.join(","));
        }
        return redacted;
    }

    return text;
}

function resolveSafeValue(
    c: SafetyContext,
    bodyOrQuerySafe?: SafeValue,
): SafeValue {
    if (bodyOrQuerySafe !== undefined && bodyOrQuerySafe !== null) {
        return bodyOrQuerySafe;
    }
    return c.req.query("safe") ?? c.req.header(SAFETY_HEADER_NAME);
}

export function withSafetyHeaders(
    c: SafetyContext,
    response: Response,
): Response {
    const safetyHeaders = c.get(SAFETY_HEADERS_KEY);
    if (!safetyHeaders) return response;

    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(safetyHeaders)) {
        headers.set(name, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function setSafetyHeader(c: SafetyContext, name: string, value: string): void {
    c.header(name, value);
    const current = c.get(SAFETY_HEADERS_KEY) ?? {};
    current[name] = value;
    c.set(SAFETY_HEADERS_KEY, current);
}

export async function applySafetyToChatRequest(
    c: SafetyContext,
    body: ChatBody,
): Promise<ChatBody> {
    const safeValue = body.safe as SafeValue;
    const messages = await applySafetyToMessages(c, body.messages, safeValue);
    const system =
        typeof body.system === "string"
            ? await applySafety(c, body.system, safeValue)
            : body.system;

    if (messages === body.messages && system === body.system) return body;
    return { ...body, messages, ...(system !== undefined ? { system } : {}) };
}

async function applySafetyToMessages(
    c: SafetyContext,
    messages: ChatBody["messages"],
    safeValue: SafeValue,
): Promise<ChatBody["messages"]> {
    let changed = false;
    const safeMessages: ChatBody["messages"] = [];
    for (const message of messages) {
        const safeMessage = await applySafetyToMessage(c, message, safeValue);
        changed ||= safeMessage !== message;
        safeMessages.push(safeMessage);
    }
    return changed ? safeMessages : messages;
}

async function applySafetyToMessage(
    c: SafetyContext,
    message: ChatMessage,
    safeValue: SafeValue,
): Promise<ChatMessage> {
    const content = message.content;
    if (typeof content === "string") {
        const safeContent = await applySafety(c, content, safeValue);
        return safeContent === content
            ? message
            : { ...message, content: safeContent };
    }

    if (!Array.isArray(content)) return message;

    let changed = false;
    const safeContent: MessageContentPart[] = [];
    for (const part of content) {
        if (isTextPart(part)) {
            const text = await applySafety(c, part.text, safeValue);
            if (text !== part.text) {
                changed = true;
                safeContent.push({ ...part, text });
                continue;
            }
        }
        safeContent.push(part);
    }

    return (
        changed ? { ...message, content: safeContent } : message
    ) as ChatMessage;
}

function isTextPart(part: MessageContentPart): part is MessageContentPart & {
    type: "text";
    text: string;
} {
    return part.type === "text" && typeof part.text === "string";
}

function getRequestFeatures(safeValue: SafeValue) {
    const normalized = normalizeSafeValue(safeValue);
    const invalid = invalidSafeTokens(normalized);
    if (invalid.length > 0) {
        throw safetyError(400, "invalid_safe", {
            message: `Unknown safe feature: ${invalid.join(", ")}`,
            safety: {
                valid: [...VALID_SAFE_TOKENS].join(","),
            },
        });
    }

    return resolveRequestSafety(normalized);
}

function safetyError(
    status: 400 | 503,
    code: string,
    extra: { message: string; safety?: object },
): HTTPException {
    const body = JSON.stringify({
        error: { type: "safety_error", code, ...extra },
    });
    return new HTTPException(status, {
        res: new Response(body, {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    });
}
