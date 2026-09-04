import { oauthProvider } from "@better-auth/oauth-provider";
import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import {
    assertStagingAccess,
    createApiKeyPlugin,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import * as betterAuthSchema from "@shared/db/better-auth.ts";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
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
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
    APIError,
    createAuthMiddleware,
    getSessionFromCtx,
} from "better-auth/api";
import { admin, openAPI } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { discordConfigFromEnv } from "./services/discord.ts";

const DELETE_ACCOUNT_FRESH_SESSION_MS = 10 * 60 * 1000;
const ADMIN_USER_IDS = ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"];

function isAdminUser(user: { id: string; role?: string | null }) {
    return (
        ADMIN_USER_IDS.includes(user.id) ||
        user.role
            ?.split(",")
            .map((role) => role.trim())
            .includes("admin") === true
    );
}

export function createAuth(env: Cloudflare.Env, ctx?: ExecutionContext) {
    const db = drizzle(env.DB);
    const apiKeyPlugin = createApiKeyPlugin();
    const discordConfig = discordConfigFromEnv(env);
    let githubProfile: { id: number; username: string } | undefined;

    const hasDiscordAccount = async (userId: string) => {
        const [account] = await db
            .select({ id: accountTable.id })
            .from(accountTable)
            .where(
                and(
                    eq(accountTable.userId, userId),
                    eq(accountTable.providerId, "discord"),
                ),
            )
            .limit(1);
        return Boolean(account);
    };

    const discordAccountAlreadyConnected = () =>
        new APIError("BAD_REQUEST", {
            code: "DISCORD_ACCOUNT_ALREADY_CONNECTED",
            message: "Only one Discord account can be connected.",
        });

    const adminPlugin = admin({ adminUserIds: ADMIN_USER_IDS });

    const oauthProviderPlugin = oauthProvider({
        loginPage: "/sign-in",
        // Only the trusted first-party dashboard clients are registered, so
        // consent is skipped. Explicit consent requests fail closed here.
        consentPage: "/error",
        scopes: ["openid", "profile", "email"],
        grantTypes: ["authorization_code"],
        accessTokenExpiresIn: 60,
        disableJwtPlugin: true,
        customUserInfoClaims: ({ user }) => ({
            role: isAdminUser(user) ? "admin" : "user",
        }),
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
                    authContext.path === "/sign-in/social" &&
                    authContext.body.provider === "discord"
                ) {
                    throw new APIError("BAD_REQUEST", {
                        message:
                            "Discord can only be connected to an existing Pollinations account.",
                    });
                }
                if (
                    authContext.path === "/link-social" &&
                    authContext.body.provider === "discord"
                ) {
                    const session = await getSessionFromCtx(authContext);
                    if (session && (await hasDiscordAccount(session.user.id))) {
                        throw discordAccountAlreadyConnected();
                    }
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
                        if (
                            account.providerId === "discord" &&
                            (await hasDiscordAccount(account.userId))
                        ) {
                            throw discordAccountAlreadyConnected();
                        }
                    },
                    after: async (account) => {
                        if (account.providerId !== "github") return;
                        // These authorization fields stay read-only in Better
                        // Auth, so persist the verified provider profile here.
                        const githubId = Number(account.accountId);
                        await db
                            .update(userTable)
                            .set({
                                githubId,
                                githubUsername:
                                    githubProfile?.id === githubId
                                        ? githubProfile.username
                                        : undefined,
                            })
                            .where(eq(userTable.id, account.userId));
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
            accountLinking: {
                allowDifferentEmails: true,
                // Better Auth 1.4 requires this for Discord accounts without a
                // verified email. The sign-in hook above still limits Discord
                // to explicit, authenticated linkSocial flows.
                trustedProviders: discordConfig ? ["discord"] : [],
            },
        },
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                mapProfileToUser: (profile) => {
                    try {
                        assertStagingAccess(env, {
                            githubId: Number(profile.id),
                            email: profile.email,
                        });
                    } catch (error) {
                        if (error instanceof StagingAccessDeniedError) {
                            throw new APIError("FORBIDDEN", {
                                message: error.message,
                            });
                        }
                        throw error;
                    }
                    githubProfile = {
                        id: Number(profile.id),
                        username: profile.login,
                    };
                    return {};
                },
            },
            ...(discordConfig && {
                discord: {
                    clientId: discordConfig.clientId,
                    clientSecret: discordConfig.clientSecret,
                    disableSignUp: true,
                    mapProfileToUser: (profile) => ({
                        // Better Auth requires an email even when explicitly
                        // linking a phone-only Discord account.
                        email: profile.email ?? `${profile.id}@discord.invalid`,
                    }),
                },
            }),
        },
        plugins: [
            adminPlugin,
            oauthProviderPlugin,
            apiKeyPlugin,
            githubProfileSyncPlugin(env, ctx),
            openAPIPlugin,
        ],
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"]["session"];
export type User = Auth["$Infer"]["Session"]["user"];

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
