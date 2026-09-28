const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    API_KEYS_URL,
    ENTRY_VERSION,
    NAMESPACE,
    SCHEMA_URL,
    SETUP_DOCS_URL,
    buildServerEntry,
    registryDescription,
    validateEntry,
    validateServersDirectory,
} = require("./registry.js");

const SERVERS_DIR = path.join(__dirname, "servers");

function readCommittedEntries() {
    return fs
        .readdirSync(SERVERS_DIR)
        .filter((name) => name.endsWith(".server.json"))
        .map((name) => ({ id: name.replace(/\.server\.json$/, ""), entry: JSON.parse(fs.readFileSync(path.join(SERVERS_DIR, name), "utf8")) }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

const POLLINATIONS_MCP_LIST_FIXTURE = {
    id: "pollinations",
    name: "Pollinations",
    description: "Access Pollinations models and API capabilities through agent tools.",
    url: "https://gen.pollinations.ai/mcp/pollinations",
};

test("buildServerEntry produces a schema-shaped entry under the org namespace", () => {
    const entry = buildServerEntry(POLLINATIONS_MCP_LIST_FIXTURE);
    assert.equal(entry.$schema, SCHEMA_URL);
    assert.equal(entry.name, "io.github.pollinations/pollinations");
    assert.equal(entry.version, ENTRY_VERSION);
    assert.equal(entry.websiteUrl, SETUP_DOCS_URL);
    const remote = entry.remotes[0];
    assert.equal(remote.type, "streamable-http");
    assert.equal(remote.url, POLLINATIONS_MCP_LIST_FIXTURE.url);
    const header = remote.headers[0];
    assert.equal(header.name, "Authorization");
    assert.equal(header.value, "Bearer {api_key}");
    assert.equal(header.isRequired, true);
    assert.equal(header.isSecret, true);
    assert.ok(remote.variables.api_key.description.includes(API_KEYS_URL));
    validateEntry(entry);
});

test("the API key requirement is templated so clients prompt for the raw key only", () => {
    const entry = buildServerEntry(POLLINATIONS_MCP_LIST_FIXTURE);
    const { headers, variables } = entry.remotes[0];
    assert.deepEqual(variables, {
        api_key: {
            description: `Pollinations API key from ${API_KEYS_URL}`,
            isRequired: true,
            isSecret: true,
            placeholder: "sk_...",
        },
    });
    assert.equal(headers[0].value, "Bearer {api_key}");
});

test("long descriptions fit the 100-char cap, preferring the first sentence", () => {
    const long = "Read Gmail, search GitHub, update Sheets, and post to Slack through Composio. Each user connects their own accounts when needed.";
    assert.equal(registryDescription(long), "Read Gmail, search GitHub, update Sheets, and post to Slack through Composio.");
    const noSentence = "a ".repeat(80).trim() + " extra words that push it past the cap";
    const trimmed = registryDescription(noSentence);
    assert.ok(trimmed.length <= 100);
    assert.ok(!trimmed.endsWith(" "));
});

test("buildServerEntry rejects malformed servers", () => {
    assert.throws(() => buildServerEntry(null), /server\.id is required/);
    assert.throws(() => buildServerEntry({ id: "Bad_ID" }), /lowercase/);
    assert.throws(() => buildServerEntry({ id: "ok", url: "http://insecure" }), /https URL/);
});

test("every committed entry is one of the six hosted servers and passes validation", () => {
    const committed = readCommittedEntries();
    assert.deepEqual(
        committed.map((file) => file.id),
        ["ask-jev", "composio", "computer", "exa", "ffmpeg", "pollinations"],
    );
    for (const { entry } of committed) {
        validateEntry(entry);
    }
    const ids = validateServersDirectory(SERVERS_DIR, fs.readdirSync, fs.readFileSync);
    assert.equal(ids.length, 6);
});

test("committed entries are exactly what the generator produces today", () => {
    const live = JSON.parse(
        require("node:child_process").execSync("curl -s https://gen.pollinations.ai/mcp", { encoding: "utf8" }),
    ).data;
    const byId = new Map(readCommittedEntries().map((file) => [file.id, file.entry]));
    for (const server of live) {
        const expected = buildServerEntry(server);
        assert.deepEqual(byId.get(server.id), expected, `committed entry drifted from the live list: ${server.id}`);
    }
});

test("validateEntry rejects the mistakes the registry would reject", () => {
    const good = buildServerEntry(POLLINATIONS_MCP_LIST_FIXTURE);
    assert.throws(() => validateEntry({ ...good, name: "pollinations/pollinations" }), /must live under/);
    assert.throws(() => validateEntry({ ...good, description: "x".repeat(101) }), /1-100 chars/);
    assert.throws(() => validateEntry({ ...good, version: "latest" }), /semantic/);
    assert.throws(
        () => validateEntry({ ...good, remotes: [{ type: "sse", url: "https://gen.pollinations.ai/mcp/pollinations", headers: [] }] }),
        /streamable-http/,
    );
});
