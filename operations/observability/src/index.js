import { env as workerEnv } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { createObservabilityApp } from "./app.ts";

const CONTAINER_NAME = "primary";
const ROOT_URL =
    workerEnv.GF_SERVER_ROOT_URL || "https://observability.pollinations.ai";
const DOMAIN = new URL(ROOT_URL).host;
const BRAND_HEAD_TAGS = `
<meta name="description" content="Pollinations operations dashboards">
<meta property="og:title" content="pollinations.ai">
<meta property="og:description" content="Pollinations operations dashboards">
<meta property="og:image" content="/grafana/public/img/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="/grafana/public/img/og-image.png">
<link rel="icon" type="image/x-icon" href="/grafana/public/img/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/grafana/public/img/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/grafana/public/img/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/grafana/public/img/apple-touch-icon.png">
<link rel="manifest" href="/grafana/public/img/manifest.json">`;

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
        GF_SERVER_ROOT_URL: `${new URL(ROOT_URL).origin}/grafana/`,
        GF_SERVER_DOMAIN: DOMAIN,
        GF_USERS_ALLOW_SIGN_UP: "false",
        GF_AUTH_ANONYMOUS_ENABLED: "false",
        GF_AUTH_DISABLE_LOGIN_FORM: "true",
        GF_AUTH_BASIC_ENABLED: "false",
        GF_AUTH_PROXY_ENABLED: "true",
        GF_AUTH_PROXY_HEADER_NAME: "X-WEBAUTH-USER",
        GF_AUTH_PROXY_HEADER_PROPERTY: "username",
        GF_AUTH_PROXY_AUTO_SIGN_UP: "true",
        GF_AUTH_PROXY_HEADERS: "Role:X-WEBAUTH-ROLE",
        GF_AUTH_PROXY_SYNC_TTL: "0",
        GF_AUTH_PROXY_ENABLE_LOGIN_TOKEN: "false",
        GF_AUTH_GENERIC_OAUTH_ENABLED: "false",
        GF_AUTH_DISABLE_SIGNOUT_MENU: "true",
        GF_SECURITY_ALLOW_EMBEDDING: "true",
        GF_SERVER_SERVE_FROM_SUB_PATH: "true",
        GF_USERS_AUTO_ASSIGN_ORG_ROLE: "Editor",
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

class BrandHeadInjector {
    element(element) {
        element.append(BRAND_HEAD_TAGS, { html: true });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/api/health") {
            await grafana(env);
            return Response.json(
                { ok: true },
                { headers: { "Cache-Control": "no-store" } },
            );
        }

        const app = createObservabilityApp(async (verifiedRequest) => {
            const container = await grafana(env);
            const response = await container.fetch(verifiedRequest);
            if (
                (response.headers.get("content-type") || "").includes(
                    "text/html",
                )
            ) {
                return new HTMLRewriter()
                    .on("head", new BrandHeadInjector())
                    .transform(response);
            }
            return response;
        });
        return app.fetch(request, env);
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
