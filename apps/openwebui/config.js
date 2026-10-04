/**
 * Every Open WebUI container setting, as a pure function of the Worker env.
 *
 * Keeping this out of worker.js means the wiring that decides who pays for a
 * chat, who can sign in, and which models the picker shows can be asserted in
 * plain Node tests without a Workers runtime. `worker.js` only calls this.
 */

function required(env, name) {
    const value = env[name];
    if (!value) {
        throw new Error(`Missing required Worker var or secret: ${name}`);
    }
    return value;
}

// Default model for a fresh chat. Open WebUI keeps the first id that exists in
// the live catalog, so a chain degrades gracefully when a model is retired.
// The bare `openai` prefix this replaces is an alias, not a catalog id, which
// left the picker falling back to the alphabetically first community model.
export const DEFAULT_MODELS = [
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano",
    "openai/gpt-5.5",
].join(",");

// Sidebar staples for a user who has not pinned anything yet: a cheap everyday
// chat model, a coding model, a small fast model, and an image model.
export const DEFAULT_PINNED_MODELS = [
    "openai/gpt-5.4-mini",
    "openai/gpt-5.3-codex",
    "openai/gpt-5.4-nano",
    "openai/gpt-image-2",
].join(",");

// Titles, tags and follow-ups need text, even when the chat model generates
// media. Non-reasoning on purpose: gpt-5-nano spent 256-1024 reasoning tokens
// and 3-12 s per title/tags/follow-up call. Seed value only; the live value is
// the `task.model.external` row in the config table.
export const TASK_MODEL_EXTERNAL = "openai/gpt-5.4-nano";

// The one thing every new user needs to understand: chats spend the Pollen
// wallet they signed in with.
export const WEBUI_BANNERS = [
    {
        id: "pollinations-billing",
        type: "info",
        title: "Chats spend your own Pollen",
        content:
            "Text, images and tool calls are billed to the Pollen wallet you signed in with. " +
            "[Check your balance](https://enter.pollinations.ai/pollen) or [top up](https://enter.pollinations.ai/top-up).",
        dismissible: true,
        timestamp: 1759500000,
    },
];

/**
 * @param {Record<string, unknown>} env Worker vars and secrets.
 * @returns {Record<string, string>} container envVars
 */
export function containerEnv(env) {
    const WEBUI_URL = required(env, "WEBUI_URL");
    const GEN_URL = required(env, "GEN_URL");

    return {
        PORT: "8080",
        WEBUI_URL,
        WEBUI_SECRET_KEY: required(env, "WEBUI_SECRET_KEY"),
        DATABASE_URL: required(env, "DATABASE_URL"),
        VECTOR_DB: "pgvector",

        // Login: Pollinations OAuth 2.1 (code + PKCE S256, public client).
        // OAUTH_CLIENT_SECRET must stay empty: authlib then uses token auth
        // "none" and sends client_id in the body, which /api/oauth/token needs.
        ENABLE_OAUTH_SIGNUP: "true",
        OAUTH_PROVIDER_NAME: "Pollinations",
        OAUTH_CLIENT_ID: required(env, "OAUTH_CLIENT_ID"),
        OAUTH_CLIENT_SECRET: "",
        OAUTH_CODE_CHALLENGE_METHOD: "S256",
        OPENID_PROVIDER_URL: `${required(env, "ENTER_URL")}/.well-known/oauth-authorization-server`,
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
        DEFAULT_MODELS,
        // Only fills the sidebar while the user has not pinned anything, and a
        // user's own pins always win afterwards.
        DEFAULT_PINNED_MODELS,
        WEBUI_BANNERS: JSON.stringify(WEBUI_BANNERS),
        // "Share to community" uploads the chat to openwebui.com, which is not
        // part of a Pollinations workspace: keep chats on this instance.
        ENABLE_COMMUNITY_SHARING: "false",
        TASK_MODEL_EXTERNAL,

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
                api_type: required(env, "API_TYPE"),
                model_ids: required(env, "MODEL_IDS"),
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
            env.MCP_URL
                ? [
                      {
                          url: env.MCP_URL,
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

        // Cache the gen /v1/models fetch per user. The upstream default is 1 s,
        // so every page load refetched and rebuilt the ~360-model list, which
        // took 6-8 s on the 0.5 vCPU instance and gated the whole page.
        MODELS_CACHE_TTL: "300",
    };
}
