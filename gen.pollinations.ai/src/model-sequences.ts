import * as schema from "@shared/db/better-auth.ts";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { CommunityModelEnv } from "./community-models.ts";

// A model_sequence row joined with its owner's GitHub username: the registry
// projects each row into a virtual "My Models" entry whose id is
// `<owner-github-username>/<name>`.
export type ModelSequenceRegistryRow = {
    id: string;
    ownerUserId: string;
    ownerGithubUsername: string;
    name: string;
    title: string;
    description: string | null;
    modelIds: string[];
    createdAt: Date;
};

export async function getModelSequenceRegistryRows(
    env: CommunityModelEnv,
): Promise<ModelSequenceRegistryRow[]> {
    const dbBinding = env.DB;
    if (!dbBinding) return [];
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            id: schema.modelSequence.id,
            ownerUserId: schema.modelSequence.ownerUserId,
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.modelSequence.name,
            title: schema.modelSequence.title,
            description: schema.modelSequence.description,
            modelIds: schema.modelSequence.modelIds,
            createdAt: schema.modelSequence.createdAt,
        })
        .from(schema.modelSequence)
        .innerJoin(
            schema.user,
            eq(schema.modelSequence.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): ModelSequenceRegistryRow[] => {
        if (!row.ownerGithubUsername) return [];
        const modelIds = Array.isArray(row.modelIds)
            ? row.modelIds.filter(
                  (modelId): modelId is string => typeof modelId === "string",
              )
            : [];
        // A sequence needs a primary and at least one fallback to do work.
        if (modelIds.length < 2) return [];
        return [
            {
                id: row.id,
                ownerUserId: row.ownerUserId,
                ownerGithubUsername: row.ownerGithubUsername,
                name: row.name,
                title: row.title,
                description: row.description,
                modelIds,
                createdAt: row.createdAt,
            },
        ];
    });
}
