import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import {
    assertStagingAccess,
    createApiKeyPlugin,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import * as betterAuthSchema from "@shared/db/better-auth.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { sendTierEventToTinybird } from "@shared/events.ts";
import { AUTH_TRUSTED_ORIGINS } from "@shared/public-urls.ts";
import { DEFAULT_TIER } from "@shared/tier-config.ts";
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
import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";

/**
 * Sanitize a raw string into a valid handle:
 * - lowercase, non-alphanumeric/hyphen chars become dashes
 * - collapse consecutive dashes, strip leading/trailing dashes
 * - cap at 39 chars (GitHub username max)
 */
export function sanitizeHandle(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 39);
}

/**
 * Ensure a candidate handle is unique in the DB.
 * Tries candidate, candidate-1 … candidate-4 then falls back to candidate-<6 random chars>.
 * All returned handles are capped at 39 chars (GitHub username max).
 */
export async function ensureUniqueHandle(
    db: DrizzleD1Database<typeof betterAuthSchema>,
    candidate: string,
): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const attempt = i === 0 ? candidate : `${candidate.slice(0, 37)}-${i}`;
        const clash = await db
            .select({ id: betterAuthSchema.user.id })
            .from(betterAuthSchema.user)
            .where(sql`lower(${betterAuthSchema.user.handle}) = ${attempt}`)
            .get();
        if (!clash) return attempt;
    }
    return `${candidate.slice(0, 32)}-${crypto.randomUUID().slice(0, 6)}`.slice(
        0,
        39,
    );
}

/**
 * For every new user that arrives without a handle (e.g. Google, email/password),
 * derive one from the email local-part and ensure it is unique.
 * GitHub signups are untouched — mapProfileToUser already set handle = profile.login.
 */
function handleFallbackPlugin(env: Cloudflare.Env): BetterAuthPlugin {
    return {
        id: "handle-fallback",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            before: async (user: GenericUser) => {
                                const u = user as GenericUser & {
                                    handle?: string | null;
                                };
                                if (u.handle) return { data: u };

                                const db = drizzle(env.DB, {
                                    schema: betterAuthSchema,
                                });
                                const localPart = u.email.split("@")[0] ?? "";
                                const sanitized = sanitizeHandle(localPart);
                                const candidate = sanitized || "user";
                                const handle = await ensureUniqueHandle(
                                    db,
                                    candidate,
                                );
                                return { data: { ...u, handle } };
                            },
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
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
        // Always anchor auth (callbacks, cookies, redirects) to the public
        // Pollinations hostname, never the Myceli upstream. The proxy
        // architecture treats *.myceli.ai as internal; direct auth flows
        // against it are intentionally non-functional.
        baseURL: env.BETTER_AUTH_URL,
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
            ...AUTH_TRUSTED_ORIGINS,
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        user: {
            additionalFields: authAdditionalFields.user,
        },
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                mapProfileToUser: (profile) => ({
                    githubId: profile.id,
                    githubUsername: profile.login,
                    handle: profile.login,
                }),
            },
        },
        plugins: [
            adminPlugin,
            apiKeyPlugin,
            tierPlugin(env, ctx),
            stagingAccessPlugin(env),
            handleFallbackPlugin(env),
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
 * GitHub is the only auth provider, so every user row has a github_id; we skip
 * the sync defensively if it is ever missing.
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

                    const githubId = user?.githubId;
                    if (!githubId) return;

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
 * Log user registration to Tinybird after user creation.
 * New users get NO starting Pollen — free drip is retired; balance comes from
 * quests or purchases. tier_balance stays NULL (treated as 0 by the gate).
 */
function onAfterUserCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (user: GenericUser, _ctx: GenericEndpointContext | null) => {
        try {
            // Log user registration event to Tinybird
            // Use the ExecutionContext passed from createAuth, not better-auth's internal context
            executionCtx?.waitUntil(
                sendTierEventToTinybird(
                    {
                        event_type: "user_registration",
                        environment: env.ENVIRONMENT || "unknown",
                        user_id: user.id,
                        tier: DEFAULT_TIER,
                        pollen_amount: 0,
                    },
                    env.TINYBIRD_TIER_INGEST_URL,
                    env.TINYBIRD_INGEST_TOKEN,
                ),
            );
        } catch (e: unknown) {
            const messageOrError = e instanceof Error ? e.message : e;
            throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `User registration logging failed. Error: ${messageOrError}`,
            });
        }
    };
}

/**
 * Restricts new signups on staging to explicit GitHub ID or email allowlists.
 * GitHub IDs are immutable, unlike usernames. No-op outside staging.
 *
 * This is a thin UX layer only — it rejects disallowed users during OAuth
 * before a `user` row is created, so /error shows "staging is invite-only"
 * instead of a 403 after they think they're logged in. The actual security
 * boundary is {@link assertStagingAccess} called per-request in
 * `shared/auth/api-key.ts` and the per-service auth middleware, which is what
 * blocks spend on the production provider keys held by staging-gen. See #11137.
 */
function stagingAccessPlugin(env: Cloudflare.Env): BetterAuthPlugin {
    if (env.ENVIRONMENT !== "staging") {
        return { id: "staging-access" };
    }
    return {
        id: "staging-access",
        init: () => ({
            options: {
                databaseHooks: {
                    user: {
                        create: {
                            before: async (user: GenericUser) => {
                                try {
                                    assertStagingAccess(env, {
                                        githubId: (
                                            user as { githubId?: number }
                                        ).githubId,
                                        email: user.email,
                                    });
                                } catch (e) {
                                    if (e instanceof StagingAccessDeniedError) {
                                        throw new APIError("FORBIDDEN", {
                                            message: e.message,
                                        });
                                    }
                                    throw e;
                                }
                                return { data: user };
                            },
                        },
                    },
                },
            } satisfies Partial<BetterAuthOptions>,
        }),
    } satisfies BetterAuthPlugin;
}
