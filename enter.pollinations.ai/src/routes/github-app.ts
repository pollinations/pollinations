import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const PROVIDER_ID = "github-app";

type GithubConnectBindings = CloudflareBindings & {
    GITHUB_CONNECT_APP_CLIENT_ID?: string;
    GITHUB_CONNECT_APP_CLIENT_SECRET?: string;
    GITHUB_CONNECT_APP_SLUG?: string;
};

type GithubInstallation = {
    id: number;
    account: { id: number; login: string } | null;
    target_type: "User" | "Organization";
    html_url: string;
    repository_selection: "all" | "selected";
};

const disconnectedStatus = (configured: boolean) => ({
    configured,
    connected: false,
    authorized: false,
    login: null,
    installationCount: 0,
    repositorySelection: null,
    manageUrl: null,
});

function getConfig(env: CloudflareBindings) {
    const bindings = env as GithubConnectBindings;
    if (
        !bindings.GITHUB_CONNECT_APP_CLIENT_ID ||
        !bindings.GITHUB_CONNECT_APP_CLIENT_SECRET ||
        !bindings.GITHUB_CONNECT_APP_SLUG
    ) {
        return null;
    }
    return { slug: bindings.GITHUB_CONNECT_APP_SLUG };
}

export const githubAppRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: false, allowSessionCookie: true }))
    .get("/status", async (c) => {
        await c.var.auth.requireAuthorization();
        const config = getConfig(c.env);
        if (!config) return c.json(disconnectedStatus(false));

        const user = c.var.auth.requireUser();
        const accounts = await c.var.auth.client.api.listUserAccounts({
            headers: c.req.raw.headers,
        });
        const account = accounts.find(
            (candidate) => candidate.providerId === PROVIDER_ID,
        );
        if (!account) return c.json(disconnectedStatus(true));

        let accessToken: string;
        try {
            const tokens = await c.var.auth.client.api.getAccessToken({
                body: { providerId: PROVIDER_ID, accountId: account.id },
                headers: c.req.raw.headers,
            });
            accessToken = tokens.accessToken;
        } catch {
            return c.json(disconnectedStatus(true));
        }

        const headers = {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "pollinations-enter",
            "X-GitHub-Api-Version": "2022-11-28",
        };
        const [profileResponse, installationsResponse] = await Promise.all([
            fetch("https://api.github.com/user", { headers }),
            fetch("https://api.github.com/user/installations", { headers }),
        ]);
        if (
            profileResponse.status === 401 ||
            installationsResponse.status === 401
        ) {
            return c.json(disconnectedStatus(true));
        }
        if (!profileResponse.ok || !installationsResponse.ok) {
            throw new HTTPException(502, {
                message: "GitHub connection check failed",
            });
        }

        const profile = (await profileResponse.json()) as {
            id: number;
            login: string;
        };
        if (profile.id !== user.githubId) {
            throw new HTTPException(403, {
                message: "GitHub connection belongs to another account",
            });
        }

        const { installations } = (await installationsResponse.json()) as {
            installations: GithubInstallation[];
        };
        const personalInstallation = installations.find(
            (installation) =>
                installation.target_type === "User" &&
                installation.account?.id === user.githubId,
        );
        const connected = installations.length > 0;

        return c.json({
            configured: true,
            connected,
            authorized: true,
            login: profile.login,
            installationCount: installations.length,
            repositorySelection:
                personalInstallation?.repository_selection ??
                installations[0]?.repository_selection ??
                null,
            personalInstalled: Boolean(personalInstallation),
            manageUrl:
                personalInstallation?.html_url ??
                installations[0]?.html_url ??
                null,
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
        return c.redirect(
            `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`,
            302,
        );
    })
    .get("/callback", async (c) => {
        await c.var.auth.requireAuthorization();
        const installationId = Number(c.req.query("installation_id"));
        if (!Number.isSafeInteger(installationId) || installationId <= 0) {
            throw new HTTPException(400, {
                message: "Invalid GitHub installation",
            });
        }
        return c.redirect("/api/github-app/authorize", 302);
    })
    .get("/authorize", async (c) => {
        await c.var.auth.requireAuthorization();
        if (!getConfig(c.env)) {
            throw new HTTPException(503, {
                message: "GitHub connection is not configured",
            });
        }
        const result = await c.var.auth.client.api.oAuth2LinkAccount({
            body: { providerId: PROVIDER_ID, callbackURL: "/account" },
            headers: c.req.raw.headers,
            returnHeaders: true,
        });
        result.headers.forEach((value, name) => {
            c.header(name, value);
        });
        return c.redirect(result.response.url, 302);
    });
