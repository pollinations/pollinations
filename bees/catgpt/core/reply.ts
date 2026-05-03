import { CAT_SYSTEM } from "./prompt.ts";
import type { CatReplyOptions } from "./types.ts";
import {
    coerceOpenAIUsage,
    type ModelUsageWithCost,
    recordUsage,
} from "./usage.ts";

const DEFAULT_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const DEFAULT_MODEL = "claude-fast";

function cleanReply(content: string): string {
    return content.trim().replace(/^["']|["']$/g, "");
}

/**
 * Typed upstream error so surface adapters can translate to the right
 * HTTP status + structured error envelope. Carries the upstream status
 * verbatim so a 401 from gen.pollinations.ai becomes a 401 to the caller,
 * not a generic 500.
 */
export class UpstreamError extends Error {
    readonly status: number;
    readonly body: string;
    constructor(status: number, body: string) {
        super(`upstream returned ${status}`);
        this.name = "UpstreamError";
        this.status = status;
        this.body = body;
    }
}

/**
 * Like `generateCatReply` but also returns `usage` (with cost). Surfaces that
 * care about billing use this; existing variants keep using the string form.
 */
export async function generateCatReplyWithUsage(
    question: string,
    imageUrl: string | null = null,
    opts: CatReplyOptions = {},
): Promise<{ text: string; usage: ModelUsageWithCost | null }> {
    const userContent = imageUrl
        ? [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
          ]
        : question;

    const model = opts.model ?? DEFAULT_MODEL;
    const res = await fetch(opts.endpoint ?? DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: CAT_SYSTEM },
                { role: "user", content: userContent },
            ],
        }),
    });
    if (!res.ok) {
        // Capture the body so the surface adapter can include it in the
        // structured error response (or log it). Limit length to keep
        // pathological responses out of memory.
        const body = await res.text().catch(() => "");
        throw new UpstreamError(res.status, body.slice(0, 500));
    }
    const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: unknown;
    };
    const text = cleanReply(data.choices[0].message.content);
    const raw = coerceOpenAIUsage(data.usage, model);
    const usage = raw ? recordUsage(raw) : null;
    return { text, usage };
}

export async function generateCatReply(
    question: string,
    imageUrl: string | null = null,
    opts: CatReplyOptions = {},
): Promise<string> {
    const { text } = await generateCatReplyWithUsage(question, imageUrl, opts);
    return text;
}
