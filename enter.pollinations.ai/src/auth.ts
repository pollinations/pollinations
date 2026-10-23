import { oauthProvider } from "@better-auth/oauth-provider";
import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import {
    assertStagingAccess,
    createApiKeyPlugin,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { ACCOUNT_RESTRICTED_MESSAGE } from "@shared/auth/ban.ts";
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
    getOAuthState,
    getSessionFromCtx,
} from "better-auth/api";
import { admin, openAPI } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { discordConfigFromEnv } from "./services/discord.ts";
import { removeUserSites } from "./services/sites.ts";
import {
    captureProductEvent,
    referringSource,
    visitorCountry,
} from "./utils/product-analytics.ts";

const DELETE_ACCOUNT_FRESH_SESSION_MS = 10 * 60 * 1000;
export const ADMIN_USER_IDS = ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"];

export function isAdminUser(user: {
    id: string;
    role?: string | null;
    banned?: boolean | null;
}) {
    return (
        !user.banned &&
        (ADMIN_USER_IDS.includes(user.id) ||
            user.role
                ?.split(",")
                .map((role) => role.trim())
                .includes("admin") === true)
    );
}

export function createAuth(env: Cloudflare.Env, ctx?: ExecutionContext) {
    const db = drizzle(env.DB);
    const apiKeyPlugin = createApiKeyPlugin();
    const discordConfig = discordConfigFromEnv(env);
    let githubProfile: { id: number; username: string } | undefined;

    // Connected accounts are one per provider: quests key their rewards on
    // the Discord, GitHub and Google ids, so a second link would earn them
    // again.
    const connectableProviders: Record<string, string> = {
        discord: "Discord",
        github: "GitHub",
        google: "Google",
    };

    const hasAccount = async (userId: string, providerId: string) => {
        const [account] = await db
            .select({ id: accountTable.id })
            .from(accountTable)
            .where(
                and(
                    eq(accountTable.userId, userId),
                    eq(accountTable.providerId, providerId),
                ),
            )
            .limit(1);
        return Boolean(account);
    };

    const accountAlreadyConnected = (providerId: string) =>
        new APIError("BAD_REQUEST", {
            code: `${providerId.toUpperCase()}_ACCOUNT_ALREADY_CONNECTED`,
            message: `Only one ${connectableProviders[providerId]} account can be connected.`,
        });

    const assertStagingSignIn = (user: {
        githubId?: number;
        email?: string | null;
    }) => {
        try {
            assertStagingAccess(env, user);
        } catch (error) {
            if (error instanceof StagingAccessDeniedError) {
                throw new APIError("FORBIDDEN", { message: error.message });
            }
            throw error;
        }
    };

    const adminPlugin = admin({
        adminUserIds: ADMIN_USER_IDS,
        bannedUserMessage: ACCOUNT_RESTRICTED_MESSAGE,
    });

    const oauthProviderPlugin = oauthProvider({
        loginPage: "/app/sign-in",
        allowPublicClientPrelogin: true,
        // Only trusted internal dashboard clients are registered, so
        // consent is skipped. Explicit consent requests fail closed here.
        consentPage: "/error",
        // Clients are seeded by migrations, not managed through the public API.
        clientPrivileges: () => false,
        scopes: ["openid", "profile", "email"],
        grantTypes: ["authorization_code"],
        // Apps recheck UserInfo throughout their 12-hour session; no refresh grant.
        accessTokenExpiresIn: 43_200,
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
                if (authContext.path === "/sign-in/social") {
                    if (authContext.body.provider === "discord")
                        throw new APIError("BAD_REQUEST", {
                            message:
                                "Discord can only be connected to an existing Pollinations account.",
                        });
                    ctx?.waitUntil(
                        captureProductEvent(env, "sign_in_started", "", {
                            ...referringSource(
                                authContext.headers,
                                env.BETTER_AUTH_URL,
                            ),
                            ...visitorCountry(authContext.headers),
                            provider: authContext.body.provider,
                        }),
                    );
                }
                // The path is the route pattern, not the resolved URL, so the
                // provider comes from params. Only with a code: a denial at
                // GitHub comes back without one and is a loss on their side,
                // not a failure of our callback.
                if (
                    authContext.path === "/callback/:id" &&
                    ["github", "google"].includes(
                        authContext.params?.id ?? "",
                    ) &&
                    authContext.query?.code
                ) {
                    ctx?.waitUntil(
                        captureProductEvent(env, "sign_in_returned", "", {
                            ...visitorCountry(authContext.headers),
                            provider: authContext.params?.id,
                        }),
                    );
                }
                const linkProvider = authContext.body?.provider;
                if (
                    authContext.path === "/link-social" &&
                    Object.hasOwn(connectableProviders, linkProvider)
                ) {
                    const session = await getSessionFromCtx(authContext);
                    if (
                        session &&
                        (await hasAccount(session.user.id, linkProvider))
                    ) {
                        throw accountAlreadyConnected(linkProvider);
                    }
                    if (session)
                        ctx?.waitUntil(
                            captureProductEvent(
                                env,
                                "link_started",
                                session.user.id,
                                {
                                    ...visitorCountry(authContext.headers),
                                    provider: linkProvider,
                                },
                            ),
                        );
                }
                // GitHub stays connected once linked: quests and community
                // models key on users.github_id.
                if (
                    authContext.path === "/unlink-account" &&
                    authContext.body?.providerId === "github"
                ) {
                    throw new APIError("BAD_REQUEST", {
                        code: "GITHUB_ACCOUNT_CANNOT_BE_DISCONNECTED",
                        message: "GitHub can't be disconnected once connected.",
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
            // Only an explicit connect carries link state; a sign-up or an
            // implicit join at sign-in does not. Counted here because the
            // account create hooks run after the request state is gone.
            after: createAuthMiddleware(async (authContext) => {
                if (authContext.path !== "/callback/:id") return;
                const link = (await getOAuthState())?.link;
                const provider = authContext.params?.id ?? "";
                if (link && (await hasAccount(link.userId, provider)))
                    ctx?.waitUntil(
                        captureProductEvent(
                            env,
                            "link_completed",
                            link.userId,
                            {
                                ...visitorCountry(authContext.headers),
                                provider,
                            },
                        ),
                    );
            }),
        },
        database: drizzleAdapter(db, {
            schema: betterAuthSchema,
            provider: "sqlite",
        }),
        databaseHooks: {
            user: {
                // Admin removal skips deleteUser.beforeDelete. Sessions and
                // logins are already gone here, so a failure is logged rather
                // than leaving the account half-deleted.
                delete: {
                    before: async (user) => {
                        await removeUserSites(env, user.id).catch((error) =>
                            console.error(
                                `Failed to remove sites of user ${user.id}`,
                                error,
                            ),
                        );
                    },
                },
                create: {
                    after: async (user, context) => {
                        ctx?.waitUntil(
                            captureProductEvent(
                                env,
                                "signup_completed",
                                user.id,
                                {
                                    ...visitorCountry(context?.headers),
                                    provider: callbackProvider(context),
                                },
                            ),
                        );
                    },
                },
            },
            account: {
                create: {
                    // Also covers implicit links on sign-in, which skip
                    // the /link-social check above.
                    before: async (account) => {
                        if (
                            Object.hasOwn(
                                connectableProviders,
                                account.providerId,
                            ) &&
                            (await hasAccount(
                                account.userId,
                                account.providerId,
                            ))
                        ) {
                            throw accountAlreadyConnected(account.providerId);
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
            // Cloudflare sets CF-Connecting-IP. A client-sent X-Forwarded-For
            // makes the chain ambiguous and drops it into one shared bucket.
            ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
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
            ...(env.ENVIRONMENT === "production"
                ? []
                : [
                      "http://localhost:3457",
                      "http://localhost:4180",
                      "http://localhost:4000",
                  ]),
        ],
        user: {
            additionalFields: authAdditionalFields.user,
            deleteUser: {
                enabled: true,
                // Runs before anything is deleted, so a Cloudflare failure
                // aborts the deletion cleanly.
                beforeDelete: (user) => removeUserSites(env, user.id),
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
                    assertStagingSignIn({
                        githubId: Number(profile.id),
                        email: profile.email,
                    });
                    githubProfile = {
                        id: Number(profile.id),
                        username: profile.login,
                    };
                    return {};
                },
            },
            google: {
                clientId: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET,
                prompt: "select_account",
                mapProfileToUser: (profile) => {
                    assertStagingSignIn({ email: profile.email });
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
 * Sync platform name and github_username on every login.
 * GitHub usernames and display names are mutable — users can rename their account.
 * We fetch the current profile from GitHub API using the immutable github_id
 * and update D1 if it changed. Non-blocking via waitUntil.
 *
 * Users who signed in with Google and never connected GitHub have no
 * github_id; they are skipped.
 */
// The provider of an OAuth callback; "" for sessions from other flows, such
// as the CLI device flow.
function callbackProvider(context?: GenericEndpointContext | null): string {
    return context?.path === "/callback/:id" ? (context.params?.id ?? "") : "";
}

export function onAfterSessionCreate(
    env: Cloudflare.Env,
    executionCtx?: ExecutionContext,
) {
    return async (
        session: { userId: string },
        ctx?: GenericEndpointContext | null,
    ) => {
        executionCtx?.waitUntil(
            captureProductEvent(env, "sign_in_completed", session.userId, {
                ...visitorCountry(ctx?.headers),
                provider: callbackProvider(ctx),
            }),
        );
        executionCtx?.waitUntil(
            (async () => {
                try {
                    const db = drizzle(env.DB);
                    const [user] = await db
                        .select({
                            name: userTable.name,
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
                            `[github-profile-sync] GitHub API ${res.status} for user ${githubId}`,
                        );
                        return;
                    }

                    const profile = (await res.json()) as {
                        login: string;
                        name?: string | null;
                    };
                    const githubName = profile.name || profile.login;

                    if (
                        profile.login &&
                        (profile.login !== user?.githubUsername ||
                            githubName !== user?.name)
                    ) {
                        await db
                            .update(userTable)
                            .set({
                                githubUsername: profile.login,
                                name: githubName,
                            })
                            .where(eq(userTable.id, session.userId));
                    }
                } catch (e) {
                    console.error(
                        "[github-profile-sync] failed for session",
                        session.userId,
                        e,
                    );
                }
            })(),
        );
    };
}
