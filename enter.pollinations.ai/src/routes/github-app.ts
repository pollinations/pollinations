import {
    type GithubAppCredentials,
    getUserInstallation,
    mintAppJwt,
} from "@shared/github/app-auth.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

type GithubConnectBindings = CloudflareBindings & {
    GITHUB_CONNECT_APP_ID?: string;
    GITHUB_CONNECT_APP_PRIVATE_KEY?: string;
    GITHUB_CONNECT_APP_SLUG?: string;
};

type GithubConnectConfig = GithubAppCredentials & { slug: string };

function getConfig(env: CloudflareBindings): GithubConnectConfig | null {
    const bindings = env as GithubConnectBindings;
    if (
        !bindings.GITHUB_CONNECT_APP_ID ||
        !bindings.GITHUB_CONNECT_APP_PRIVATE_KEY ||
        !bindings.GITHUB_CONNECT_APP_SLUG
    ) {
        return null;
    }
    return {
        appId: bindings.GITHUB_CONNECT_APP_ID,
        privateKey: bindings.GITHUB_CONNECT_APP_PRIVATE_KEY,
        slug: bindings.GITHUB_CONNECT_APP_SLUG,
    };
}

function getGithubIdentity(user: {
    githubId?: number | null;
    githubUsername?: string | null;
}) {
    if (!user?.githubId || !user.githubUsername) {
        throw new HTTPException(409, {
            message: "A linked GitHub identity is required",
        });
    }
    return {
        githubId: user.githubId,
        githubUsername: user.githubUsername,
    };
}

async function loadInstallation(
    env: CloudflareBindings,
    config: GithubConnectConfig,
    githubUsername: string,
) {
    const appJwt =
        env.ENVIRONMENT === "test"
            ? "mock_github_auth_token"
            : await mintAppJwt(config);
    return getUserInstallation(appJwt, githubUsername);
}

export const githubAppRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: false, allowSessionCookie: true }))
    .get("/status", async (c) => {
        await c.var.auth.requireAuthorization();
        const config = getConfig(c.env);
        if (!config) return c.json({ configured: false, connected: false });

        const user = getGithubIdentity(c.var.auth.requireUser());
        const installation = await loadInstallation(
            c.env,
            config,
            user.githubUsername,
        );
        const connected =
            installation?.target_type === "User" &&
            installation.account?.id === user.githubId;

        return c.json({
            configured: true,
            connected,
            manageUrl: connected ? installation.html_url : null,
        });
    })
    .get("/install", async (c) => {
        await c.var.auth.requireAuthorization();
        const config = getConfig(c.env);
        if (!config) {
            throw new HTTPException(503, {
                message: "GitHub connection is not configured",
            });
        }
        getGithubIdentity(c.var.auth.requireUser());
        return c.redirect(
            `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`,
            302,
        );
    })
    .get("/callback", async (c) => {
        await c.var.auth.requireAuthorization();
        const config = getConfig(c.env);
        if (!config) {
            throw new HTTPException(503, {
                message: "GitHub connection is not configured",
            });
        }

        const installationId = Number(c.req.query("installation_id"));
        if (!Number.isSafeInteger(installationId) || installationId <= 0) {
            throw new HTTPException(400, {
                message: "Invalid GitHub installation",
            });
        }

        const user = getGithubIdentity(c.var.auth.requireUser());
        const installation = await loadInstallation(
            c.env,
            config,
            user.githubUsername,
        );
        if (
            !installation ||
            installation.id !== installationId ||
            installation.target_type !== "User" ||
            installation.account?.id !== user.githubId
        ) {
            throw new HTTPException(403, {
                message: "GitHub installation does not belong to this account",
            });
        }

        return c.redirect("/account", 302);
    });
