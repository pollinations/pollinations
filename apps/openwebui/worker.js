import { env as workerEnv } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";
import { containerEnv } from "./config.js";

const CONTAINER_NAME = "primary";
const WEBUI_URL = workerEnv.WEBUI_URL;
if (!WEBUI_URL) {
    throw new Error("Missing required Worker var or secret: WEBUI_URL");
}

/**
 * Open WebUI with Pollinations as its only login provider. The consent-minted
 * sk_ is forwarded to gen.pollinations.ai per user (auth_type system_oauth),
 * so every chat is paid from the signed-in user's own wallet.
 *
 * Every setting lives in config.js as a pure function of the Worker env, so
 * the billing, login and model-discovery wiring is covered by plain Node tests
 * (config.test.js) instead of only by a deployed container.
 *
 * Container disk is ephemeral, so all state lives in Postgres (DATABASE_URL,
 * which also hosts the pgvector store). Uploaded files are still local and do
 * not survive a container restart; move them to R2 (STORAGE_PROVIDER=s3) when
 * that matters.
 */
export class OpenWebUIContainer extends Container {
    defaultPort = 8080;
    requiredPorts = [8080];
    sleepAfter = "30m";
    envVars = containerEnv(workerEnv);
}

function openwebui(env) {
    return getContainer(env.OPENWEBUI, CONTAINER_NAME);
}

export default {
    async fetch(request, env) {
        const response = await openwebui(env).fetch(request);
        if (response.webSocket) return response;
        // Send the full chat URL as the referrer when a user follows a link
        // out of a chat, so enter's top-up and key pages can bring them back
        // to that chat. The browser default would send the origin only.
        const headers = new Headers(response.headers);
        headers.set("Referrer-Policy", "no-referrer-when-downgrade");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    },

    // Keepalive: a request every 5 minutes resets sleepAfter.
    async scheduled(_controller, env, ctx) {
        ctx.waitUntil(
            openwebui(env)
                .fetch(new Request(`${WEBUI_URL}/health`))
                .then((response) => {
                    if (!response.ok) {
                        console.warn(
                            `Open WebUI health returned ${response.status}`,
                        );
                    }
                })
                .catch((error) => {
                    console.error("Open WebUI health check failed", error);
                }),
        );
    },
};
