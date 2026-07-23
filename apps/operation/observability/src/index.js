import { env as workerEnv } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";

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
        GF_AUTH_DISABLE_LOGIN_FORM: "false",
        GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH:
            "/etc/grafana/provisioning/dashboards/observability.json",
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
        const container = await grafana(env);
        const url = new URL(request.url);

        if (BRAND_ASSET_PATHS.has(url.pathname)) {
            url.pathname = `/public/img${url.pathname}`;
            return container.fetch(new Request(url, request));
        }

        const response = await container.fetch(request);
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
