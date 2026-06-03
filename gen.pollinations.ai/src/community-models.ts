import { communityModelId } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import type { ModelInfo } from "@shared/registry/model-info.ts";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const COMMUNITY_TEXT_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];

function toFixedPoint(n: number): string {
    return n.toFixed(12).replace(/\.?0+$/, "");
}

function addPrice(
    pricing: Record<string, string> & { currency: "pollen" },
    key: string,
    value: number,
): void {
    if (Number.isFinite(value) && value > 0) {
        pricing[key] = toFixedPoint(value);
    }
}

export async function getCommunityTextModelsInfo(
    dbBinding: CloudflareBindings["DB"] | undefined,
): Promise<ModelInfo[]> {
    if (!dbBinding) return [];

    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            description: schema.communityEndpoint.description,
            promptTextPrice: schema.communityEndpoint.promptTextPrice,
            completionTextPrice: schema.communityEndpoint.completionTextPrice,
            contextLength: schema.communityEndpoint.contextLength,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): ModelInfo[] => {
        if (!row.ownerGithubUsername) return [];
        const pricing: Record<string, string> & { currency: "pollen" } = {
            currency: "pollen",
        };
        addPrice(pricing, "promptTextTokens", row.promptTextPrice);
        addPrice(pricing, "completionTextTokens", row.completionTextPrice);

        return [
            {
                name: communityModelId(row.ownerGithubUsername, row.name),
                aliases: [],
                category: "community",
                pricing,
                description: row.description ?? undefined,
                input_modalities: ["text"],
                output_modalities: ["text"],
                context_length: row.contextLength ?? undefined,
            },
        ];
    });
}

export function communityTextSupportedEndpoints(): string[] {
    return COMMUNITY_TEXT_ENDPOINTS;
}
