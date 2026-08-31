import { env as workerEnv } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { createPollinationsAuth } from "@pollinations/auth";

const CONTAINER_NAME = "primary";
const ROOT_URL =
    workerEnv.GF_SERVER_ROOT_URL || "https://observability.pollinations.ai";
const DOMAIN = new URL(ROOT_URL).host;
const BRAND_ASSET_PATHS = new Set([
    "/favicon.ico",
    "/favicon-16x16.png",
    "/favicon-32x32.png",
    "/apple-touch-icon.png",
    "/android-chrome-192x192.png",
    "/android-chrome-512x512.png",
    "/icon-192.png",
    "/icon-512.png",
    "/manifest.json",
    "/og-image.png",
]);

const BRAND_HEAD_TAGS = `
<meta name="description" content="Pollinations operations dashboards">
<meta property="og:title" content="pollinations.ai">
<meta property="og:description" content="Pollinations operations dashboards">
<meta property="og:image" content="/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="/og-image.png">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">`;

function requiredSecret(name) {
    const value = workerEnv[name];
    if (!value) {
        throw new Error(`Missing required Worker secret: ${name}`);
    }
    return value;
}

export class ObservabilityGrafana extends Container {
    defaultPort = 3000;
    requiredPorts = [3000];
    sleepAfter = "10m";
    envVars = {
        GF_SECURITY_ADMIN_USER: workerEnv.GF_ADMIN_USER || "admin",
        GF_SECURITY_ADMIN_PASSWORD: requiredSecret("GF_ADMIN_PASSWORD"),
        GF_SECURITY_ADMIN_EMAIL: workerEnv.GF_ADMIN_EMAIL || "hi@myceli.ai",
        GF_SERVER_ROOT_URL: ROOT_URL,
        GF_SERVER_DOMAIN: DOMAIN,
        GF_USERS_ALLOW_SIGN_UP: "false",
        GF_AUTH_ANONYMOUS_ENABLED: "false",
        GF_AUTH_DISABLE_LOGIN_FORM: "true",
        GF_AUTH_PROXY_ENABLED: "true",
        GF_AUTH_PROXY_HEADER_NAME: "X-WEBAUTH-USER",
        GF_AUTH_PROXY_HEADER_PROPERTY: "email",
        GF_AUTH_PROXY_AUTO_SIGN_UP: "true",
        GF_USERS_AUTO_ASSIGN_ORG_ROLE: "Editor",
        GF_AUTH_SIGNOUT_REDIRECT_URL: `${ROOT_URL}/auth/logout`,
        GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH:
            "/etc/grafana/provisioning/dashboards/platform-usage-rebuild.json",
        TINYBIRD_READ_TOKEN: requiredSecret("TINYBIRD_READ_TOKEN"),
        TINYBIRD_LEGACY_READ_TOKEN: requiredSecret(
            "TINYBIRD_LEGACY_READ_TOKEN",
        ),
        DISCORD_WEBHOOK_URL: requiredSecret("DISCORD_WEBHOOK_URL"),
    };
}

async function grafana(env) {
    const container = env.OBSERVABILITY_GRAFANA.getByName(CONTAINER_NAME);
    await container.startAndWaitForPorts();
    return container;
}

function auth(env) {
    return createPollinationsAuth({
        clientId: env.POLLINATIONS_OAUTH_CLIENT_ID,
        sessionSecret: env.POLLINATIONS_AUTH_SESSION_SECRET,
        baseUrl: env.POLLINATIONS_AUTH_BASE_URL,
    });
}

function withGrafanaIdentity(request, email) {
    const headers = new Headers(request.headers);
    headers.delete("X-WEBAUTH-EMAIL");
    headers.delete("X-WEBAUTH-ROLE");
    headers.set("X-WEBAUTH-USER", email);
    return new Request(request, { headers });
}

class BrandHeadInjector {
    element(element) {
        element.append(BRAND_HEAD_TAGS, { html: true });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        let pollinationsAuth;
        try {
            pollinationsAuth = auth(env);
        } catch {
            return Response.json(
                { error: "Observability configuration unavailable" },
                { status: 500 },
            );
        }

        if (url.pathname === "/api/health") {
            await grafana(env);
            return Response.json(
                { ok: true },
                { headers: { "Cache-Control": "no-store" } },
            );
        }

        const authResponse = await pollinationsAuth.handle(request);
        if (authResponse) return authResponse;

        const user = await pollinationsAuth.getUser(request);
        if (!user) return pollinationsAuth.signIn(request);

        const container = await grafana(env);
        const authenticatedRequest = withGrafanaIdentity(request, user.email);

        if (BRAND_ASSET_PATHS.has(url.pathname)) {
            url.pathname = `/public/img${url.pathname}`;
            return container.fetch(new Request(url, authenticatedRequest));
        }

        const response = await container.fetch(authenticatedRequest);
        if (
            url.pathname === "/logout" &&
            response.status >= 300 &&
            response.status < 400
        ) {
            const headers = new Headers(response.headers);
            headers.set(
                "Location",
                new URL("/auth/logout", url.origin).toString(),
            );
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
            return new HTMLRewriter()
                .on("head", new BrandHeadInjector())
                .transform(response);
        }

        return response;
    },

    async scheduled(_controller, env, ctx) {
        const healthRequest = new Request(`${ROOT_URL}/api/health`);
        ctx.waitUntil(
            grafana(env)
                .then((container) => container.fetch(healthRequest))
                .then((response) => {
                    if (!response.ok) {
                        console.warn(
                            `Grafana health check returned ${response.status}`,
                        );
                    }
                })
                .catch((error) => {
                    console.error("Grafana health check failed", error);
                }),
        );
    },
};
