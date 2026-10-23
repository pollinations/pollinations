import { z } from "zod";
import { communityRealtimeUrl } from "./community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    normalizeCommunityEndpointBearerToken,
} from "./community-endpoints.ts";
import type { Usage } from "./registry/registry.ts";

type RealtimeCacheUsage = { audioTokens: number; imageTokens: number };
function numeric(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function positiveEntries(usage: Usage): Usage {
    return Object.fromEntries(
        Object.entries(usage).filter(([, value]) => value && value > 0),
    ) as Usage;
}

const tokenCount = z.number().nonnegative().nullish();

export const RealtimeUsageSchema = z
    .object({
        input_tokens: tokenCount,
        output_tokens: tokenCount,
        input_token_details: z
            .object({
                text_tokens: tokenCount,
                audio_tokens: tokenCount,
                image_tokens: tokenCount,
                cached_tokens: tokenCount,
                cached_tokens_details: z
                    .object({
                        text_tokens: tokenCount,
                        audio_tokens: tokenCount,
                        image_tokens: tokenCount,
                    })
                    .partial()
                    .passthrough()
                    .nullish(),
            })
            .partial()
            .passthrough()
            .nullish(),
        output_token_details: z
            .object({
                text_tokens: tokenCount,
                audio_tokens: tokenCount,
            })
            .partial()
            .passthrough()
            .nullish(),
    })
    .partial()
    .passthrough();

export type ParsedRealtimeUsage = {
    usage: Usage;
    cacheUsage: RealtimeCacheUsage;
    cacheDetailsIncomplete: boolean;
};

export function parseRealtimeUsage(
    rawUsage: unknown,
): ParsedRealtimeUsage | null {
    const parsed = RealtimeUsageSchema.safeParse(rawUsage);
    if (!parsed.success) return null;
    const usage = parsed.data;
    const inputDetails = usage.input_token_details ?? {};
    const outputDetails = usage.output_token_details ?? {};
    const cachedDetails = inputDetails.cached_tokens_details ?? {};

    const cachedTextTokens = numeric(cachedDetails.text_tokens);
    const cachedAudioTokens = numeric(cachedDetails.audio_tokens);
    const cachedImageTokens = numeric(cachedDetails.image_tokens);
    const reportedCachedTokens = numeric(inputDetails.cached_tokens);
    const detailedCachedTokens =
        cachedTextTokens + cachedAudioTokens + cachedImageTokens;
    const cachedTokens = reportedCachedTokens || detailedCachedTokens;
    const cacheDetailsIncomplete =
        reportedCachedTokens > 0 &&
        (inputDetails.cached_tokens_details == null ||
            detailedCachedTokens !== reportedCachedTokens);

    const promptAudioTokens = Math.max(
        0,
        numeric(inputDetails.audio_tokens) - cachedAudioTokens,
    );
    const promptImageTokens = Math.max(
        0,
        numeric(inputDetails.image_tokens) - cachedImageTokens,
    );
    const totalInputTokens =
        numeric(usage.input_tokens) ||
        numeric(inputDetails.text_tokens) +
            numeric(inputDetails.audio_tokens) +
            numeric(inputDetails.image_tokens);
    const promptTextTokens = Math.max(
        0,
        totalInputTokens - cachedTokens - promptAudioTokens - promptImageTokens,
    );
    const completionAudioTokens = numeric(outputDetails.audio_tokens);
    const outputTokenTotal = numeric(usage.output_tokens);
    const totalOutputTokens =
        outputTokenTotal ||
        numeric(outputDetails.text_tokens) + completionAudioTokens;
    const completionTextTokens = Math.max(
        numeric(outputDetails.text_tokens),
        totalOutputTokens - completionAudioTokens,
    );

    return {
        usage: positiveEntries({
            promptTextTokens,
            promptCachedTokens: cachedTokens,
            promptAudioTokens,
            promptImageTokens,
            completionTextTokens,
            completionAudioTokens,
        }),
        cacheUsage: {
            audioTokens: cachedAudioTokens,
            imageTokens: cachedImageTokens,
        },
        cacheDetailsIncomplete,
    };
}

export function parseCommunityRealtimeUsage(
    value: unknown,
): ParsedRealtimeUsage | null {
    const raw = RealtimeUsageSchema.safeParse(value);
    const parsed = parseRealtimeUsage(value);
    if (!raw.success || !parsed || parsed.cacheDetailsIncomplete) return null;
    const input = raw.data.input_token_details;
    const output = raw.data.output_token_details;
    if (
        raw.data.input_tokens == null ||
        raw.data.output_tokens == null ||
        raw.data.input_tokens !==
            numeric(input?.text_tokens) + numeric(input?.audio_tokens) ||
        raw.data.output_tokens !==
            numeric(output?.text_tokens) + numeric(output?.audio_tokens) ||
        numeric(input?.image_tokens) > 0 ||
        numeric(input?.cached_tokens) > raw.data.input_tokens ||
        numeric(input?.cached_tokens_details?.audio_tokens) >
            numeric(input?.audio_tokens) ||
        numeric(input?.cached_tokens_details?.text_tokens) >
            numeric(input?.text_tokens) ||
        numeric(input?.cached_tokens_details?.image_tokens) > 0
    )
        return null;
    return parsed;
}

export async function connectCommunityRealtime(input: {
    baseUrl: string;
    bearerToken: string;
    model: string;
}): Promise<Response & { webSocket?: WebSocket | null }> {
    const url = new URL(communityRealtimeUrl(input.baseUrl));
    url.searchParams.set("model", input.model);
    return fetch(url, {
        headers: {
            Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(input.bearerToken)}`,
            Upgrade: "websocket",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
    });
}
