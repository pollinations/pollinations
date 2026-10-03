import { env as workerEnv } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";

const CONTAINER_NAME = "primary";
const WEBUI_URL = required("WEBUI_URL");
const GEN_URL = required("GEN_URL");

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
        OPENID_PROVIDER_URL: `${required("ENTER_URL")}/.well-known/oauth-authorization-server`,
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
        // Titles, tags and follow-ups need text, even when the chat model generates media.
        // Non-reasoning on purpose: gpt-5-nano spent 256-1024 reasoning tokens and
        // 3-12 s per title/tags/follow-up call. Seed value only; the live value is
        // the `task.model.external` row in the config table.
        TASK_MODEL_EXTERNAL: "openai/gpt-5.4-nano",

        // Model backend: gen.pollinations.ai, bearer = the user's OAuth sk_.
        ENABLE_OLLAMA_API: "false",
        ENABLE_RESPONSES_API_STATEFUL: "false",
        OPENAI_API_BASE_URLS: GEN_URL,
        OPENAI_API_KEYS: "",
        OPENAI_API_CONFIGS: JSON.stringify({
            0: {
                enable: true,
                auth_type: "system_oauth",
                key: "",
                prefix_id: "",
                api_type: required("API_TYPE"),
                model_ids: required("MODEL_IDS"),
                connection_type: "external",
                tags: [],
            },
        }),

        // Open WebUI injects its own builtin tools (time, chat history, ask_user)
        // into every request that originates from its UI, unless the model says
        // otherwise. Models fetched from a connection have no row in the model
        // table, so utils/models.py applies this default metadata to them
        // wholesale. Without it every chat carries tool specs, which managed
        // agents and community models that do not support tool calling reject.
        // The MCP tool server below is unaffected: it is opt-in per chat.
        DEFAULT_MODEL_METADATA: JSON.stringify({
            capabilities: { builtin_tools: false },
        }),

        // Pollinations MCP as a tool server, on the same per-user consent key as
        // the model connection above: generation from a tool call is billed to
        // the signed-in user, and getBalance reports their own wallet.
        // access_grants is required — without it the server is admin-only.
        // Both of these are seeded into the DB only on a first boot with an
        // empty config table; afterwards the stored row wins and editing this
        // does nothing (Config.seed_defaults inserts missing keys only).
        TOOL_SERVER_CONNECTIONS: JSON.stringify(
            workerEnv.MCP_URL
                ? [
                      {
                          url: workerEnv.MCP_URL,
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
                  ]
                : [],
        ),

        // RAG embeds with the bundled SentenceTransformers model, not gen.
        // The RAG, image and audio subsystems all authenticate with a single
        // static key rather than the per-user OAuth token the chat connection
        // uses, so pointing them at gen would bill every user's documents to
        // one wallet. Local embedding keeps that off a shared budget; the cost
        // is a ~90 MB model download onto the ephemeral disk after a restart.
        ENABLE_VERSION_UPDATE_CHECK: "false",

        // Onboarding: replace upstream's generic starter cards (Roman Empire
        // trivia, kids' art) with suggestions that exercise what this
        // deployment actually offers — the Pollinations MCP tool server
        // (images, audio, balance) and the model catalog. These are seeded
        // into `ui.prompt_suggestions` on first boot only; existing
        // instances get them via admin Settings or SQL (see README).
        DEFAULT_PROMPT_SUGGESTIONS: JSON.stringify([
            {
                title: ["Generate an image", "with the Pollinations image tool"],
                content:
                    "Generate an image of a lighthouse in a storm using the Pollinations image tool, then describe what you created in one sentence.",
            },
            {
                title: ["Take me on a tour", "of what this app can do"],
                content:
                    "What models and tools does Pollinations give me here? Give me a quick tour with concrete things to try.",
            },
            {
                title: ["Compare two models", "GPT-6.1 Sol vs Claude Sonnet 5.5"],
                content:
                    "I mostly write and brainstorm. Compare GPT-6.1 Sol and Claude Sonnet 5.5 for that, recommend one, and say why in two sentences.",
            },
            {
                title: ["Check my pollen", "balance and recent usage"],
                content:
                    "Use the Pollinations balance tool to check how much pollen I have left, and explain what affects how fast I spend it.",
            },
            {
                title: ["Tell me a story", "and read it aloud"],
                content:
                    "Tell me a two-minute story about a deep-sea diver who finds a locked door, then read it aloud with the audio tool.",
            },
            {
                title: ["Answer from my documents", "set up a knowledge base"],
                content:
                    "How do I upload my own documents here and ask questions against them? Walk me through creating a knowledge base.",
            },
        ]),

        // Model discovery: pin a small curated set so new users see strong
        // default picks in the sidebar instead of a ~300-model alphabetical
        // list. All three are verified to run on the default (seed) tier, so
        // the pins never dead-end a brand-new account; higher-tier users can
        // search the full catalog. This env is read verbatim (no JSON
        // parsing); the /api/config payload carries it as a comma-separated
        // string, which is the shape the frontend splits on. Seeded into
        // `ui.default_pinned_models` on first boot only; existing instances
        // via admin settings or SQL.
        DEFAULT_PINNED_MODELS:
            "openai/gpt-5.4-nano,openai/gpt-5-nano,qwen/qwen3.8-2.4t-a95b",

        // Knowledge: let signed-in users build their own knowledge bases.
        // Upstream defaults workspace knowledge off for `user`-role accounts,
        // which left the RAG stack (pgvector + local embeddings, already
        // deployed) unreachable for everyone but admins. Embeddings run on
        // the bundled local model, so indexing a user's documents never
        // touches a shared wallet; the retrieval prompt itself bills the
        // signed-in user. Seeded into `user.permissions` on first boot only.
        USER_PERMISSIONS_WORKSPACE_KNOWLEDGE_ACCESS: "true",

        // Cache the gen /v1/models fetch per user. The upstream default is 1 s,
        // so every page load refetched and rebuilt the ~360-model list, which
        // took 6-8 s on the 0.5 vCPU instance and gated the whole page.
        MODELS_CACHE_TTL: "300",
    };
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
