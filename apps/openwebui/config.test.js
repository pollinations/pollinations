import assert from "node:assert/strict";
import test from "node:test";
import {
    containerEnv,
    DEFAULT_MODELS,
    DEFAULT_PINNED_MODELS,
    TASK_MODEL_EXTERNAL,
    WEBUI_BANNERS,
} from "./config.js";
import {
    missingModelIds,
    readFixture,
    referencedModelIds,
} from "./scripts/check-model-ids.mjs";

const PRODUCTION = {
    WEBUI_URL: "https://openwebui.pollinations.ai",
    GEN_URL: "https://gen.pollinations.ai/v1",
    ENTER_URL: "https://enter.pollinations.ai",
    WEBUI_SECRET_KEY: "test-secret",
    DATABASE_URL: "postgres://openwebui@db/openwebui",
    OAUTH_CLIENT_ID: "pk_test",
    API_TYPE: "chat_completions",
    // wrangler passes a JSON var through as an array, not a string.
    MODEL_IDS: [],
    MCP_URL: "https://mcp.pollinations.ai/",
};

const STAGING = {
    ...PRODUCTION,
    WEBUI_URL: "https://openwebui-staging.elliot-b6e.workers.dev",
    GEN_URL: "https://staging.gen.pollinations.ai/v1",
    ENTER_URL: "https://staging.enter.pollinations.ai",
    API_TYPE: "responses",
    MCP_URL: "",
};

const connection = (env) => JSON.parse(env.OPENAI_API_CONFIGS)[0];

test("a missing secret fails fast and names the variable", () => {
    const { DATABASE_URL: _dropped, ...withoutDatabase } = PRODUCTION;
    assert.throws(
        () => containerEnv(withoutDatabase),
        /Missing required Worker var or secret: DATABASE_URL/,
    );
});

test("every chat is billed to the signed-in user, never a shared key", () => {
    const env = containerEnv(PRODUCTION);
    assert.equal(env.OPENAI_API_KEYS, "");
    assert.equal(env.OPENAI_API_BASE_URLS, PRODUCTION.GEN_URL);
    assert.deepEqual(connection(env), {
        enable: true,
        auth_type: "system_oauth",
        key: "",
        prefix_id: "",
        api_type: "chat_completions",
        model_ids: [],
        connection_type: "external",
        tags: [],
    });
});

test("Pollinations is the only way in", () => {
    const env = containerEnv(PRODUCTION);
    assert.equal(env.ENABLE_LOGIN_FORM, "false");
    assert.equal(env.ENABLE_PASSWORD_AUTH, "false");
    assert.equal(env.ENABLE_SIGNUP, "false");
    assert.equal(env.ENABLE_OAUTH_SIGNUP, "true");
    assert.equal(env.OAUTH_CODE_CHALLENGE_METHOD, "S256");
    assert.equal(env.OAUTH_CLIENT_SECRET, "");
    assert.equal(env.OAUTH_SCOPES, "profile");
    assert.equal(
        env.OPENID_REDIRECT_URI,
        `${PRODUCTION.WEBUI_URL}/oauth/oidc/callback`,
    );
    assert.equal(
        env.OPENID_PROVIDER_URL,
        `${PRODUCTION.ENTER_URL}/.well-known/oauth-authorization-server`,
    );
    // A signed-in user must be able to chat, not land on a read-only role.
    assert.equal(env.DEFAULT_USER_ROLE, "user");
});

test("the picker starts on real catalog ids instead of an alias", () => {
    const env = containerEnv(PRODUCTION);
    // Full catalog: an empty model_ids list keeps every route's models visible.
    assert.deepEqual(connection(env).model_ids, []);
    // Connection models have no model-table row, so access control would hide
    // them from every non-admin.
    assert.equal(env.BYPASS_MODEL_ACCESS_CONTROL, "true");

    const chain = DEFAULT_MODELS.split(",");
    assert.ok(chain.length > 1, "a chain degrades when a model is retired");
    assert.deepEqual(env.DEFAULT_MODELS.split(","), chain);
    // `openai` is an alias, not an id: the old value made Open WebUI fall back
    // to the alphabetically first community model for every new chat.
    assert.ok(
        chain.every((id) => id.includes("/")),
        `expected canonical ids, got ${DEFAULT_MODELS}`,
    );
});

test("every referenced model id exists in the recorded catalog", () => {
    const fixture = readFixture();
    const referenced = referencedModelIds();
    assert.ok(referenced.length >= 5);
    assert.deepEqual(missingModelIds(referenced, fixture.ids), []);
    // The fixture only records ids, so an alias-only value would fail above.
    assert.ok(fixture.ids.includes(TASK_MODEL_EXTERNAL));
    for (const id of DEFAULT_PINNED_MODELS.split(",")) {
        assert.ok(
            fixture.ids.includes(id),
            `${id} is not in catalog.fixture.json; run scripts/check-model-ids.mjs --refresh`,
        );
    }
});

test("the MCP tool server is enabled for everyone on the user's own key", () => {
    const env = containerEnv(PRODUCTION);
    const connections = JSON.parse(env.TOOL_SERVER_CONNECTIONS);
    assert.equal(connections.length, 1);
    const [server] = connections;
    assert.equal(server.url, "https://mcp.pollinations.ai/");
    assert.equal(server.type, "mcp");
    assert.equal(server.auth_type, "system_oauth");
    assert.equal(server.config.enable, true);
    // An empty grant list means admin-only, not everyone.
    assert.deepEqual(server.config.access_grants, [
        {
            principal_type: "user",
            principal_id: "*",
            permission: "read",
        },
    ]);

    // Staging has no external tool server at all.
    const staging = containerEnv(STAGING);
    assert.deepEqual(JSON.parse(staging.TOOL_SERVER_CONNECTIONS), []);
});

test("models without a tools field are not sent builtin tool specs", () => {
    const env = containerEnv(PRODUCTION);
    assert.deepEqual(JSON.parse(env.DEFAULT_MODEL_METADATA), {
        capabilities: { builtin_tools: false },
    });
});

test("the billing banner is one dismissible notice that explains Pollen", () => {
    const env = containerEnv(PRODUCTION);
    const banners = JSON.parse(env.WEBUI_BANNERS);
    assert.deepEqual(banners, WEBUI_BANNERS);
    assert.equal(banners.length, 1);
    const [banner] = banners;
    assert.equal(banner.type, "info");
    assert.equal(banner.dismissible, true);
    assert.match(banner.content, /Pollen wallet/);
    assert.match(banner.content, /enter\.pollinations\.ai/);
    // A duplicate id would make the second banner unreachable.
    assert.equal(
        new Set(banners.map((entry) => entry.id)).size,
        banners.length,
    );
});

test("chats stay on this instance and the page load keeps its model cache", () => {
    const env = containerEnv(PRODUCTION);
    // "Share to community" uploads the chat to openwebui.com.
    assert.equal(env.ENABLE_COMMUNITY_SHARING, "false");
    // Rebuilding the ~360-model list took 6-8 s on the 0.5 vCPU instance and
    // gated the whole page; this is the cache that stops that.
    assert.equal(Number.parseInt(env.MODELS_CACHE_TTL, 10), 300);
    assert.equal(env.ENABLE_VERSION_UPDATE_CHECK, "false");
});

test("the staging environment builds with its own endpoints and API type", () => {
    const env = containerEnv(STAGING);
    assert.equal(env.WEBUI_URL, STAGING.WEBUI_URL);
    assert.equal(connection(env).api_type, "responses");
    assert.deepEqual(connection(env).model_ids, []);
    assert.equal(env.ENABLE_RESPONSES_API_STATEFUL, "false");
    // Secrets still have to be provided per environment.
    assert.throws(
        () => containerEnv({ ...STAGING, OAUTH_CLIENT_ID: "" }),
        /OAUTH_CLIENT_ID/,
    );
});
