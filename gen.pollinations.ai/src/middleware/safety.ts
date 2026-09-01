import type {
    CreateChatCompletionRequest,
    MessageContentPart,
} from "@shared/schemas/openai.ts";
import type { SafeValue } from "@shared/schemas/safety.ts";
import {
    invalidSafeTokens,
    normalizeSafeValue,
    parseSafeFeatures,
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
import { classifyTriggers } from "@/utils/safety-features.ts";

type SafetyContext = Context<Env>;
type ChatBody = CreateChatCompletionRequest & Record<string, unknown>;
type ChatMessage = ChatBody["messages"][number];
const SAFETY_HEADERS_KEY = "safetyHeaders";
const SAFETY_MAX_TEXT_CHARS = 50_000;
const SAFETY_MAX_TEXT_PARTS = 25;

export type SafetyVariables = {
    safetyHeaders?: Record<string, string>;
};

export async function applySafety(
    c: SafetyContext,
    text: string,
    bodySafe?: SafeValue,
): Promise<string> {
    const [safeText] = await applySafetyToTexts(c, [text], bodySafe);
    return safeText;
}

export async function applySafetyToTexts(
    c: SafetyContext,
    texts: string[],
    bodySafe?: SafeValue,
): Promise<string[]> {
    const safeValue = resolveSafeValue(c, bodySafe);
    const features = getRequestFeatures(safeValue);
    if (features.size === 0) return texts;

    const guardrailInputs = selectGuardrailInputs(texts);
    if (guardrailInputs.length === 0) return texts;

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
        response = await applyGuardrail(
            guardrailInputs.map((input) => input.text),
            "INPUT",
            guardrailEnv,
        );
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

    if (response.action !== "GUARDRAIL_INTERVENED") return texts;

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

    if (!features.has("privacy")) return texts;

    const safeTexts = [...texts];
    let changed = false;
    for (const [outputIndex, input] of guardrailInputs.entries()) {
        const redacted = response.outputs?.[outputIndex]?.text;
        if (!redacted || redacted === input.text) continue;
        safeTexts[input.originalIndex] =
            texts[input.originalIndex].slice(0, input.offset) + redacted;
        changed = true;
    }

    if (changed) {
        if (redactedIds.length > 0) {
            setSafetyHeader(c, "X-Safety-Redacted", redactedIds.join(","));
        }
        return safeTexts;
    }

    return texts;
}

function selectGuardrailInputs(texts: string[]) {
    const inputs: { originalIndex: number; text: string; offset: number }[] =
        [];
    let remainingChars = SAFETY_MAX_TEXT_CHARS;
    let remainingParts = SAFETY_MAX_TEXT_PARTS;

    // Keep safety to one Bedrock call. For large requests, scan the latest
    // text window and leave earlier context unchanged.
    for (
        let index = texts.length - 1;
        index >= 0 && remainingChars > 0 && remainingParts > 0;
        index--
    ) {
        const text = texts[index];
        if (!text.trim()) continue;

        const scannedText =
            text.length > remainingChars ? text.slice(-remainingChars) : text;
        inputs.push({
            originalIndex: index,
            text: scannedText,
            offset: text.length - scannedText.length,
        });
        remainingChars -= scannedText.length;
        remainingParts--;
    }

    return inputs.reverse();
}

function resolveSafeValue(
    c: SafetyContext,
    providedSafe?: SafeValue,
): SafeValue {
    if (providedSafe !== undefined && providedSafe !== null) {
        return providedSafe;
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
    const targets = collectChatTextTargets(body);
    const safeTexts = await applySafetyToTexts(
        c,
        targets.map((target) => target.text),
        safeValue,
    );

    let nextMessages = body.messages;
    let nextSystem = body.system;
    let changed = false;
    for (const [targetIndex, target] of targets.entries()) {
        const safeText = safeTexts[targetIndex];
        if (safeText === target.text) continue;
        changed = true;

        if (target.kind === "system") {
            nextSystem = safeText;
            continue;
        }

        if (nextMessages === body.messages) nextMessages = [...body.messages];
        const message = {
            ...nextMessages[target.messageIndex],
        } as ChatMessage;

        if (target.partIndex === undefined) {
            message.content = safeText;
        } else if (Array.isArray(message.content)) {
            const content = [...message.content] as MessageContentPart[];
            content[target.partIndex] = {
                ...content[target.partIndex],
                text: safeText,
            } as MessageContentPart;
            message.content = content;
        }

        nextMessages[target.messageIndex] = message;
    }

    if (!changed) return body;
    return {
        ...body,
        messages: nextMessages,
        ...(nextSystem !== undefined ? { system: nextSystem } : {}),
    };
}

type ChatTextTarget =
    | { kind: "system"; text: string }
    | {
          kind: "message";
          messageIndex: number;
          partIndex?: number;
          text: string;
      };

function collectChatTextTargets(body: ChatBody): ChatTextTarget[] {
    const targets: ChatTextTarget[] = [];
    if (typeof body.system === "string") {
        targets.push({ kind: "system", text: body.system });
    }

    for (const [messageIndex, message] of body.messages.entries()) {
        const content = message.content;
        if (typeof content === "string") {
            targets.push({ kind: "message", messageIndex, text: content });
            continue;
        }
        if (!Array.isArray(content)) continue;

        for (const [partIndex, part] of content.entries()) {
            if (isTextPart(part)) {
                targets.push({
                    kind: "message",
                    messageIndex,
                    partIndex,
                    text: part.text,
                });
            }
            // Non-text parts, like image_url/video_url, are not sent to
            // text-only Bedrock guardrails and remain unchanged.
        }
    }

    return targets;
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

    return parseSafeFeatures(normalized);
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
