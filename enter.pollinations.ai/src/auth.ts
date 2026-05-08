import { getCurrentAuthContext } from "@better-auth/core/context";
import { createApiKeyPlugin } from "@shared/auth/api-key.ts";
import * as betterAuthSchema from "@shared/db/better-auth.ts";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { DEFAULT_TIER, getTierPollen } from "@shared/tier-config.ts";
import {
    type BetterAuthOptions,
    type BetterAuthPlugin,
    betterAuth,
    type DBAdapter,
    type DBTransactionAdapter,
    type GenericEndpointContext,
    type User as GenericUser,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, openAPI } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sendTierEventToTinybird } from "./events.ts";

type DBAdapterFactory = (options: BetterAuthOptions) => DBAdapter;
type FindOneQuery = Parameters<DBAdapter["findOne"]>[0];

function strictGithubOAuthAdapter(factory: DBAdapterFactory): DBAdapterFactory {
    return (options) => strictGithubOAuthDBAdapter(factory(options));
}

function strictGithubOAuthDBAdapter(adapter: DBAdapter): DBAdapter {
    return {
        ...adapter,
        findOne: strictFindOne(adapter),
        transaction: (callback) =>
            adapter.transaction((trx) =>
                callback(strictGithubOAuthTransactionAdapter(trx)),
            ),
    };
}

function strictGithubOAuthTransactionAdapter(
    adapter: DBTransactionAdapter,
): DBTransactionAdapter {
    return {
        ...adapter,
        findOne: strictFindOne(adapter),
    };
}

function strictFindOne(adapter: Pick<DBAdapter, "findOne">) {
    return async <T>(query: FindOneQuery): Promise<T | null> => {
        // Better Auth 1.4 falls back to user.email during OAuth sign-in.
        // GitHub auth must resolve only by the immutable provider account id.
        if (isUserEmailLookup(query) && (await isGithubOAuthCallback())) {
            return null;
        }

        return adapter.findOne<T>(query);
    };
}

function isUserEmailLookup(query: FindOneQuery): boolean {
    const [where] = query.where;
    return (
        query.model === "user" &&
        query.where.length === 1 &&
        where?.field === "email" &&
        where.operator === undefined
    );
}

async function isGithubOAuthCallback(): Promise<boolean> {
    try {
        const current = await getCurrentAuthContext();
        const requestUrl = current.request?.url;
        if (!requestUrl) return false;

        return new URL(requestUrl).pathname.endsWith(
            "/api/auth/callback/github",
        );
    } catch {
        return false;
    }
}

export function createAuth(env: Cloudflare.Env, ctx?: ExecutionContext) {
    const db = drizzle(env.DB);
    const apiKeyPlugin = createApiKeyPlugin();

    const adminPlugin = admin({
        adminUserIds: ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"],
    });

    const openAPIPlugin = openAPI({
        disableDefaultReference: true,
    });

    return betterAuth({
        basePath: "/api/auth",
        onAPIError: {
            errorURL: "/error",
        },
        database: strictGithubOAuthAdapter(
            drizzleAdapter(db, {
                schema: betterAuthSchema,
                provider: "sqlite",
            }),
        ),
        account: {
            accountLinking: {
                enabled: false,
                disableImplicitLinking: true,
                allowDifferentEmails: false,
                trustedProviders: [],
            },
        },
        advanced: {
            // Configure background tasks for Cloudflare Workers
            // Required for deferUpdates to work properly
            backgroundTasks: ctx
                ? {
                      handler: (promise: Promise<unknown>) => {
                          ctx.waitUntil(
                              promise.catch(() => {
                                  // Silently ignore - these are non-critical tracking updates
                                  // (lastRequest, requestCount) that fail due to D1 contention
                                  // under high concurrent load. Auth still works correctly.
                              }),
                          );
                      },
                  }
                : undefined,
        },
        trustedOrigins: ["*"],
        user: {
            additionalFields: {
                githubId: {
                    type: "number",
                    input: false,
                },
                githubUsername: {
                    type: "string",
                    input: false,
                },
                tier: {
                    type: "string",
                    defaultValue: "spore",
                    input: false,
                },
            },
        },
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                mapProfileToUser: (profile) => ({
                    githubId: profile.id,
                    githubUsername: profile.login,
                }),
            },
        },
        plugins: [
            adminPlugin,
            apiKeyPlugin,
            tierPlugin(env, ctx),
            openAPIPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

/**
 * Plugin to initialize tier balance for new users in D1.
 */
function tierPlugin(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
): BetterAuthPlugin {
    return {
        id: "tier",
        init: (_ctx) => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            after: onAfterUserCreate(env, executionCtx),
                        },
                    },
                    session: {
                        create: {
                            after: onAfterSessionCreate(env, executionCtx),
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}

/**
 * Sync github_username on every login.
 * GitHub usernames are mutable — users can rename their account.
 * We fetch the current username from GitHub API using the immutable github_id
 * and update D1 if it changed. Non-blocking via waitUntil.
 *
 * When github_id is missing from the user table (legacy rows), we resolve it
 * from the account table and backfill so subsequent logins skip the fallback.
 */
function onAfterSessionCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (
        session: { userId: string },
        _ctx?: GenericEndpointContext | null,
    ) => {
        executionCtx?.waitUntil(
            (async () => {
                try {
                    const db = drizzle(env.DB);
                    const [user] = await db
                        .select({
                            githubId: userTable.githubId,
                            githubUsername: userTable.githubUsername,
                        })
                        .from(userTable)
                        .where(eq(userTable.id, session.userId))
                        .limit(1);

                    let githubId = user?.githubId;

                    // Fallback: resolve github_id from the account table
                    if (!githubId) {
                        const [acct] = await db
                            .select({ accountId: accountTable.accountId })
                            .from(accountTable)
                            .where(
                                and(
                                    eq(accountTable.userId, session.userId),
                                    eq(accountTable.providerId, "github"),
                                ),
                            )
                            .limit(1);

                        if (!acct?.accountId) return;
                        githubId = Number(acct.accountId);

                        // Backfill so subsequent logins skip this fallback
                        await db
                            .update(userTable)
                            .set({ githubId })
                            .where(eq(userTable.id, session.userId));
                    }

                    const headers: Record<string, string> = {
                        Accept: "application/vnd.github+json",
                        "User-Agent": "pollinations-enter",
                    };
                    // Use OAuth app credentials for 5,000 req/hr (vs 60 unauthenticated)
                    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
                        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
                    }
                    const res = await fetch(
                        `https://api.github.com/user/${githubId}`,
                        { headers },
                    );
                    if (!res.ok) {
                        console.error(
                            `[username-sync] GitHub API ${res.status} for user ${githubId}`,
                        );
                        return;
                    }

                    const profile = (await res.json()) as { login: string };
                    if (
                        profile.login &&
                        profile.login !== user?.githubUsername
                    ) {
                        await db
                            .update(userTable)
                            .set({ githubUsername: profile.login })
                            .where(eq(userTable.id, session.userId));
                    }
                } catch (e) {
                    console.error(
                        "[username-sync] failed for session",
                        session.userId,
                        e,
                    );
                }
            })(),
        );
    };
}

/**
 * Set initial tier balance in D1 after user creation.
 * This guarantees new users get their default tier pollen.
 */
function onAfterUserCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (user: GenericUser, _ctx: GenericEndpointContext | null) => {
        try {
            const db = drizzle(env.DB);
            const tierBalance = getTierPollen(DEFAULT_TIER);
            await db
                .update(userTable)
                .set({
                    tierBalance,
                    lastTierGrant: Date.now(),
                })
                .where(eq(userTable.id, user.id));

            // Log user registration event to Tinybird
            // Use the ExecutionContext passed from createAuth, not better-auth's internal context
            executionCtx?.waitUntil(
                sendTierEventToTinybird(
                    {
                        event_type: "user_registration",
                        environment: env.ENVIRONMENT || "unknown",
                        user_id: user.id,
                        tier: DEFAULT_TIER,
                        pollen_amount: tierBalance,
                    },
                    env.TINYBIRD_TIER_INGEST_URL,
                    env.TINYBIRD_INGEST_TOKEN,
                ),
            );
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `User tier initialization failed. Error: ${messageOrError}`,
            });
        }
    };
}
