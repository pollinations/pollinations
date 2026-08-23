import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import {
    assertStagingAccess,
    createApiKeyPlugin,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import * as betterAuthSchema from "@shared/db/better-auth.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { AUTH_TRUSTED_ORIGINS } from "@shared/public-urls.ts";
import {
    type BetterAuthOptions,
    type BetterAuthPlugin,
    betterAuth,
    type GenericEndpointContext,
    type User as GenericUser,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
    APIError,
    createAuthMiddleware,
    getSessionFromCtx,
} from "better-auth/api";
import { admin, genericOAuth, openAPI } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const DELETE_ACCOUNT_FRESH_SESSION_MS = 10 * 60 * 1000;

export function createAuth(env: Cloudflare.Env, ctx?: ExecutionContext) {
    const db = drizzle(env.DB);
    const apiKeyPlugin = createApiKeyPlugin();
    const githubConnectEnv = env as Cloudflare.Env & {
        GITHUB_CONNECT_APP_CLIENT_ID?: string;
        GITHUB_CONNECT_APP_CLIENT_SECRET?: string;
    };
    const discordEnv = env as Cloudflare.Env & {
        DISCORD_CLIENT_ID: string;
        DISCORD_CLIENT_SECRET: string;
    };

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
        hooks: {
            // better-auth has its own freshness check on /delete-user, but it
            // scales freshAge by 1e3 twice (update-user.mjs), so the threshold
            // lands ~1000x too high and never fires. Enforce it here instead.
            before: createAuthMiddleware(async (authContext) => {
                if (
                    (authContext.path === "/sign-in/oauth2" &&
                        authContext.body?.providerId === "github-app") ||
                    (authContext.path === "/sign-in/social" &&
                        authContext.body?.provider === "discord")
                ) {
                    throw new APIError("BAD_REQUEST", {
                        message:
                            "This provider can only be connected to an existing Pollinations account.",
                    });
                }
                if (authContext.path !== "/delete-user") return;

                const session = await getSessionFromCtx(authContext);
                if (!session) return;

                const sessionCreatedAt = new Date(
                    session.session.createdAt,
                ).getTime();
                if (
                    Date.now() - sessionCreatedAt >
                    DELETE_ACCOUNT_FRESH_SESSION_MS
                ) {
                    throw new APIError("BAD_REQUEST", {
                        code: "SESSION_EXPIRED",
                        message:
                            "For security, sign in again before deleting your account.",
                    });
                }
            }),
        },
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
        databaseHooks: {
            account: {
                create: {
                    before: async (account) => {
                        if (account.providerId === "discord") {
                            return { data: discardOAuthTokens(account) };
                        }
                        if (account.providerId !== "github-app") {
                            return undefined;
                        }
                        const [user] = await db
                            .select({ githubId: userTable.githubId })
                            .from(userTable)
                            .where(eq(userTable.id, account.userId))
                            .limit(1);
                        if (String(user?.githubId) !== account.accountId) {
                            throw new APIError("BAD_REQUEST", {
                                message:
                                    "Authorize the same GitHub account used to sign in to Pollinations.",
                            });
                        }
                        return undefined;
                    },
                },
                update: {
                    before: async (account, context) => {
                        if (context?.params?.id !== "discord") return;
                        return { data: discardOAuthTokens(account) };
                    },
                },
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

        trustedOrigins: [
            ...AUTH_TRUSTED_ORIGINS,
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        user: {
            additionalFields: authAdditionalFields.user,
            deleteUser: {
                enabled: true,
            },
        },
        account: {
            encryptOAuthTokens: true,
            accountLinking: {
                allowDifferentEmails: true,
                disableImplicitLinking: true,
                // Better Auth 1.4 requires this for Discord accounts without a
                // verified email. The sign-in hook above still limits Discord
                // to explicit, authenticated linkSocial flows.
                trustedProviders: ["discord", "github-app"],
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
            discord: {
                clientId: discordEnv.DISCORD_CLIENT_ID,
                clientSecret: discordEnv.DISCORD_CLIENT_SECRET,
                disableSignUp: true,
                mapProfileToUser: (profile) => ({
                    // Better Auth requires an email even when explicitly
                    // linking a phone-only Discord account.
                    email: profile.email ?? `${profile.id}@discord.invalid`,
                }),
            },
        },
        plugins: [
            adminPlugin,
            apiKeyPlugin,
            genericOAuth({
                config:
                    githubConnectEnv.GITHUB_CONNECT_APP_CLIENT_ID &&
                    githubConnectEnv.GITHUB_CONNECT_APP_CLIENT_SECRET
                        ? [
                              {
                                  providerId: "github-app",
                                  clientId:
                                      githubConnectEnv.GITHUB_CONNECT_APP_CLIENT_ID,
                                  clientSecret:
                                      githubConnectEnv.GITHUB_CONNECT_APP_CLIENT_SECRET,
                                  authorizationUrl:
                                      "https://github.com/login/oauth/authorize",
                                  tokenUrl:
                                      "https://github.com/login/oauth/access_token",
                                  disableSignUp: true,
                                  getUserInfo: async (tokens) => {
                                      const response = await fetch(
                                          "https://api.github.com/user",
                                          {
                                              headers: {
                                                  Accept: "application/vnd.github+json",
                                                  Authorization: `Bearer ${tokens.accessToken}`,
                                                  "User-Agent":
                                                      "pollinations-enter",
                                                  "X-GitHub-Api-Version":
                                                      "2022-11-28",
                                              },
                                          },
                                      );
                                      if (!response.ok) return null;
                                      const profile =
                                          (await response.json()) as {
                                              id: number;
                                              login: string;
                                              email: string | null;
                                              avatar_url: string;
                                          };
                                      return {
                                          id: String(profile.id),
                                          email:
                                              profile.email ??
                                              `${profile.id}@github.invalid`,
                                          emailVerified: true,
                                          name: profile.login,
                                          image: profile.avatar_url,
                                      };
                                  },
                              },
                          ]
                        : [],
            }),
            githubProfileSyncPlugin(env, ctx),
            stagingAccessPlugin(env),
            openAPIPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

function discardOAuthTokens<T extends Record<string, unknown>>(account: T) {
    return {
        ...account,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
    };
}

function githubProfileSyncPlugin(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
): BetterAuthPlugin {
    return {
        id: "github-profile-sync",
        init: () => ({
            options: {
                databaseHooks: {
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

                    // OAuth client_id/secret Basic auth is rejected by GitHub
                    // (401); the App installation token is the authenticated path.
                    const headers: Record<string, string> = {
                        Accept: "application/vnd.github+json",
                        "User-Agent": "pollinations-enter",
                        "X-GitHub-Api-Version": "2022-11-28",
                        Authorization: `token ${
                            env.ENVIRONMENT === "test"
                                ? "mock_github_auth_token"
                                : await getInstallationToken(
                                      githubAppCredentialsFromEnv(env),
                                      "pollinations",
                                  )
                        }`,
                    };
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
