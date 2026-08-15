import { UpstreamError } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { fallbackCandidates, withModelFallback } from "../fallback.ts";
import {
    type CreateModerationRequest,
    MODERATION_CATEGORIES,
} from "../schemas/moderations.ts";
import { generateTextPortkey } from "../text/generateTextPortkey.ts";
import { syncTextEnvironment } from "../text/handler.ts";
import type { ChatMessage } from "../text/types.ts";

type ModerationContext = Context<Env>;

type ModerationResult = {
    flagged: boolean;
    categories: Record<(typeof MODERATION_CATEGORIES)[number], boolean>;
    category_scores: Record<(typeof MODERATION_CATEGORIES)[number], number>;
};

const MODERATION_SYSTEM_PROMPT = [
    "You are a content moderation classifier. Classify the user input for harmful content.",
    "Respond with ONLY a JSON object, no markdown, no commentary, matching exactly this schema:",
    `{"flagged": boolean, "is_safe": boolean, "categories": {${MODERATION_CATEGORIES.map(
        (c) => `"${c}": boolean`,
    ).join(", ")}}, "category_scores": {${MODERATION_CATEGORIES.map(
        (c) => `"${c}": number`,
    ).join(", ")}}}`,
    '"flagged" must be true whenever any category applies. "category_scores" holds 0-1 confidence per category.',
].join("\n");

function addUsage(target: Usage, usage: Usage): void {
    for (const [key, value] of Object.entries(usage) as [
        keyof Usage,
        number,
    ][]) {
        target[key] = (target[key] ?? 0) + value;
    }
}

/**
 * Best-effort JSON extraction from a model answer: strips markdown fences and
 * takes the first `{...}` span. Returns null when nothing parseable exists.
 */
function extractJson(text: string): string | null {
    const noFences = text.replace(/```(?:json)?/gi, "").trim();
    const start = noFences.indexOf("{");
    const end = noFences.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    return noFences.slice(start, end + 1);
}

function parseVerdict(content: string | undefined | null): ModerationResult {
    const unparseable = (): UpstreamError =>
        new UpstreamError(502, {
            message: "Moderation model returned an unparseable verdict",
        });
    if (!content) {
        throw new UpstreamError(502, {
            message: "Moderation model returned an empty verdict",
        });
    }
    const jsonText = extractJson(content);
    if (!jsonText) throw unparseable();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
        throw unparseable();
    }

    const categories = Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [
            category,
            Boolean(
                (data.categories as Record<string, unknown> | undefined)?.[
                    category
                ],
            ),
        ]),
    ) as ModerationResult["categories"];
    const category_scores = Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [
            category,
            Number(
                (data.category_scores as Record<string, unknown> | undefined)?.[
                    category
                ] ?? 0,
            ),
        ]),
    ) as ModerationResult["category_scores"];

    const flagged =
        data.flagged === true ||
        data.is_safe === false ||
        MODERATION_CATEGORIES.some((category) => categories[category]) ||
        MODERATION_CATEGORIES.some(
            (category) => category_scores[category] >= 0.5,
        );

    return { flagged, categories, category_scores };
}

function moderationResponse(
    responseModel: string,
    results: ModerationResult[],
    usage: Usage,
): Response {
    return new Response(
        JSON.stringify({
            id: `modr_${crypto.randomUUID()}`,
            model: responseModel,
            results,
        }),
        {
            headers: {
                "Content-Type": "application/json",
                ...buildUsageHeaders(responseModel, usage),
            },
        },
    );
}

export async function generateModeration(
    c: ModerationContext,
    request: CreateModerationRequest,
): Promise<Response> {
    syncTextEnvironment(c.env);
    const inputs = Array.isArray(request.input)
        ? request.input
        : [request.input];
    const portkey = c.env.PORTKEY;
    const fetcher = portkey
        ? (input: string, init?: RequestInit) => portkey.fetch(input, init)
        : undefined;

    const messagesFor = (input: string): ChatMessage[] => [
        { role: "system", content: MODERATION_SYSTEM_PROMPT },
        { role: "user", content: input },
    ];

    const aggregatedUsage: Usage = {};

    const { result, candidate, index } = await withModelFallback(
        fallbackCandidates(c.var.model),
        async (attempt) => {
            const perInputResults: ModerationResult[] = [];
            for (const input of inputs) {
                const completion = await generateTextPortkey(
                    messagesFor(input),
                    {
                        model: attempt.id,
                        temperature: 0,
                        max_tokens: 1024,
                        portkeyGatewayUrl: c.env.PORTKEY_GATEWAY_URL,
                    },
                    fetcher,
                );
                if (completion.usage) {
                    addUsage(
                        aggregatedUsage,
                        openaiUsageToUsage(
                            completion.usage as Parameters<
                                typeof openaiUsageToUsage
                            >[0],
                        ),
                    );
                }
                perInputResults.push(
                    parseVerdict(
                        completion.choices?.[0]?.message?.content as
                            | string
                            | undefined,
                    ),
                );
            }
            return perInputResults;
        },
        c.var.track?.failedCalls,
    );
    if (candidate.entry) c.set("servedModelEntry", candidate.entry);

    const response = moderationResponse(
        c.var.model.resolved,
        result,
        aggregatedUsage,
    );
    if (index > 0) {
        response.headers.set(
            FALLBACK_TARGET_HEADER,
            `config.targets[${index}]`,
        );
    }
    return response;
}
