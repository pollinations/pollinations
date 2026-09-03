import { env as workerEnv } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";

const CONTAINER_NAME = "primary";
const WEBUI_URL = required("WEBUI_URL");
const GEN_URL = "https://gen.pollinations.ai/v1";

function required(name) {
    const value = workerEnv[name];
    if (!value) {
        throw new Error(`Missing required Worker var or secret: ${name}`);
    }
    return value;
}

/**
 * Open WebUI with Pollinations as its only login provider. The consent-minted
 * sk_ is forwarded to gen.pollinations.ai per user (auth_type system_oauth),
 * so every chat is paid from the signed-in user's own wallet.
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
    envVars = {
        PORT: "8080",
        WEBUI_URL,
        WEBUI_SECRET_KEY: required("WEBUI_SECRET_KEY"),
        DATABASE_URL: required("DATABASE_URL"),
        VECTOR_DB: "pgvector",

        // Login: Pollinations OAuth 2.1 (code + PKCE S256, public client).
        // OAUTH_CLIENT_SECRET must stay empty: authlib then uses token auth
        // "none" and sends client_id in the body, which /api/oauth/token needs.
        ENABLE_OAUTH_SIGNUP: "true",
        OAUTH_PROVIDER_NAME: "Pollinations",
        OAUTH_CLIENT_ID: required("OAUTH_CLIENT_ID"),
        OAUTH_CLIENT_SECRET: "",
        OAUTH_CODE_CHALLENGE_METHOD: "S256",
        OPENID_PROVIDER_URL:
            "https://enter.pollinations.ai/.well-known/oauth-authorization-server",
        OPENID_REDIRECT_URI: `${WEBUI_URL}/oauth/oidc/callback`,
        OAUTH_SCOPES: "profile",
        OAUTH_USERNAME_CLAIM: "name",
        OAUTH_EMAIL_CLAIM: "email",
        OAUTH_PICTURE_CLAIM: "picture",
        OAUTH_AUTHORIZE_PARAMS: JSON.stringify({ expiry: 365, budget: 20 }),
        OAUTH_MERGE_ACCOUNTS_BY_EMAIL: "true",
        OAUTH_AUTO_REDIRECT: "true",
        // Pollinations is the only way in.
        ENABLE_LOGIN_FORM: "false",
        ENABLE_PASSWORD_AUTH: "false",
        ENABLE_SIGNUP: "false",
        // Anyone with a Pollinations account may chat; they pay with their own pollen.
        DEFAULT_USER_ROLE: "user",
        // Models fetched from a connection have no row in the model table, and
        // get_filtered_models() shows unconfigured models to admins only. Without
        // this every non-admin gets an empty model picker.
        BYPASS_MODEL_ACCESS_CONTROL: "true",
        // Without this the model picker defaults to the alphabetically first
        // community model.
        DEFAULT_MODELS: "openai",

        // Model backend: gen.pollinations.ai, bearer = the user's OAuth sk_.
        ENABLE_OLLAMA_API: "false",
        OPENAI_API_BASE_URLS: GEN_URL,
        OPENAI_API_KEYS: "",
        OPENAI_API_CONFIGS: JSON.stringify({
            0: {
                enable: true,
                auth_type: "system_oauth",
                key: "",
                prefix_id: "",
                model_ids: [],
                connection_type: "external",
                tags: [],
            },
        }),

        // Pollinations MCP as a tool server, on the same per-user consent key as
        // the model connection above: generation from a tool call is billed to
        // the signed-in user, and getBalance reports their own wallet.
        // access_grants is required — without it the server is admin-only.
        // Both of these are seeded into the DB only on a first boot with an
        // empty config table; afterwards the stored row wins and editing this
        // does nothing (Config.seed_defaults inserts missing keys only).
        TOOL_SERVER_CONNECTIONS: JSON.stringify([
            {
                url: "https://mcp.pollinations.ai/",
                path: "",
                type: "mcp",
                auth_type: "system_oauth",
                key: "",
                config: {
                    enable: true,
                    access_grants: [
                        {
                            principal_type: "user",
                            principal_id: "*",
                            permission: "read",
                        },
                    ],
                },
                info: {
                    id: "pollinations",
                    name: "Pollinations",
                    description:
                        "Generate images, video, audio, text and embeddings from your own wallet.",
                },
            },
        ]),

        // Never download local embedding/whisper models onto the ephemeral disk.
        RAG_EMBEDDING_ENGINE: "openai",
        RAG_OPENAI_API_BASE_URL: GEN_URL,
        ENABLE_VERSION_UPDATE_CHECK: "false",
    };
}

function openwebui(env) {
    return getContainer(env.OPENWEBUI, CONTAINER_NAME);
}

export default {
    async fetch(request, env) {
        return openwebui(env).fetch(request);
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
