import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createApiKeyAuth } from "../../auth/api-key.ts";
import {
    type ApiKeyType,
    type CallerMetadata,
    createApiKeyForUser,
} from "../../auth/api-key-creation.ts";
import {
    apikey as apiKeyTable,
    user as userTable,
} from "../../db/better-auth.ts";

export type CreateTestUserOptions = {
    id?: string;
    name?: string;
    email?: string;
    tierBalance?: number | null;
    packBalance?: number | null;
    githubId?: number | null;
    githubUsername?: string | null;
};

export type CreateTestApiKeyOptions = {
    userId?: string;
    user?: CreateTestUserOptions;
    name?: string;
    type?: ApiKeyType;
    expiresIn?: number;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    metadata?: CallerMetadata;
};

export async function createTestUser(opts: CreateTestUserOptions = {}) {
    const db = drizzle(env.DB);
    const userId = opts.id ?? `test-user-${crypto.randomUUID()}`;

    await db.insert(userTable).values({
        id: userId,
        name: opts.name ?? "Test User",
        email: opts.email ?? `${userId}@test.local`,
        emailVerified: true,
        image: null,
        tierBalance: opts.tierBalance ?? 0,
        packBalance: opts.packBalance ?? 0,
        githubId: opts.githubId ?? null,
        githubUsername: opts.githubUsername ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    return userId;
}

export async function createTestApiKey(opts: CreateTestApiKeyOptions = {}) {
    const userId = opts.userId ?? (await createTestUser(opts.user));
    const authClient = createApiKeyAuth(env);
    const type = opts.type ?? "secret";
    const testPollenBudget =
        opts.pollenBudget === undefined && type === "publishable"
            ? 100
            : opts.pollenBudget;

    const created = await createApiKeyForUser({
        authClient,
        dbBinding: env.DB,
        userId,
        name: opts.name ?? `${type}-test-key`,
        type,
        expiresIn: opts.expiresIn,
        allowedModels: opts.allowedModels,
        pollenBudget: testPollenBudget,
        accountPermissions: opts.accountPermissions,
        metadata: opts.metadata,
        allowAccountKeysPermission: true,
        defaultCreatedVia: "test",
    });

    if (type === "publishable" && testPollenBudget != null) {
        await drizzle(env.DB)
            .update(apiKeyTable)
            .set({ pollenBalance: testPollenBudget })
            .where(eq(apiKeyTable.id, created.id));
    }

    return {
        ...created,
        ...(type === "publishable" &&
            testPollenBudget != null && { pollenBudget: testPollenBudget }),
        userId,
    };
}
