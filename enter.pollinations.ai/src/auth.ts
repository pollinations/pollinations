import {
    assertStagingAccess,
    createApiKeyPlugin,
    parseGithubIdList,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
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
    type GenericEndpointContext,
    type User as GenericUser,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, openAPI } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sendTierEventToTinybird } from "./events.ts";

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
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
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

        trustedOrigins: [
            "https://pollinations.ai",
            "https://*.pollinations.ai",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
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
            stagingAccessPlugin(env),
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

/**
 * Looks up a user's GitHub ID for the staging access gate.
 *
 * Reads `user.github_id` first; if NULL (legacy rows from before the column
 * existed), falls back to the `account` table — the OAuth flow stores the
 * numeric GitHub ID as `account.account_id` when `provider_id = "github"`.
 * Mirrors the same fallback used by {@link onAfterSessionCreate}.
 */
async function resolveGithubIdForUser(
    env: Cloudflare.Env,
    userId: string,
): Promise<number | null> {
    const db = drizzle(env.DB);
    const [row] = await db
        .select({ githubId: userTable.githubId })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);
    if (row?.githubId) return Number(row.githubId);
    const [acct] = await db
        .select({ accountId: accountTable.accountId })
        .from(accountTable)
        .where(
            and(
                eq(accountTable.userId, userId),
                eq(accountTable.providerId, "github"),
            ),
        )
        .limit(1);
    const n = Number(acct?.accountId);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Restricts sign-in on the staging environment to an allowlist of GitHub
 * user IDs (numeric, immutable — usernames are mutable and unsafe to gate on).
 * No-op outside staging. Gated by `env.STAGING_ALLOWED_GITHUB_IDS`.
 *
 * Why: staging holds production provider keys but a sandbox Stripe; any
 * signed-up user could mint a key and bill us real OpenAI/Google money. See
 * issue #11137.
 *
 * This plugin guards the OAuth flow (signup + session creation). Request-time
 * guards for pre-existing sessions and API keys live in `shared/auth/api-key.ts`
 * and the per-service auth middleware.
 */
function stagingAccessPlugin(env: Cloudflare.Env): BetterAuthPlugin {
    if (env.ENVIRONMENT !== "staging") {
        return { id: "staging-access" };
    }
    const allowed = parseGithubIdList(env.STAGING_ALLOWED_GITHUB_IDS);
    const denyAsAPIError = (e: unknown) => {
        if (e instanceof StagingAccessDeniedError) {
            throw new APIError("FORBIDDEN", { message: e.message });
        }
        throw e;
    };
    return {
        id: "staging-access",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            before: async (user: GenericUser) => {
                                const ghId = (user as { githubId?: number })
                                    .githubId;
                                try {
                                    assertStagingAccess(env, {
                                        githubId: ghId,
                                    });
                                } catch (e) {
                                    denyAsAPIError(e);
                                }
                                return { data: user };
                            },
                        },
                    },
                    session: {
                        create: {
                            before: async (session: { userId: string }) => {
                                const ghId = await resolveGithubIdForUser(
                                    env,
                                    session.userId,
                                );
                                if (!ghId || !allowed.has(ghId)) {
                                    throw new APIError("FORBIDDEN", {
                                        message: "staging is invite-only",
                                    });
                                }
                                return { data: session };
                            },
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}
