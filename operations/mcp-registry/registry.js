/*
 * Builds official MCP registry entries (server.json) for the hosted Pollinations
 * MCP servers.
 *
 * The source of truth is shared/registry/mcp.ts, projected publicly by
 * GET https://gen.pollinations.ai/mcp. This module turns one entry of that
 * list into a registry entry under the io.github.pollinations/ namespace.
 * A server added to shared/registry/mcp.ts therefore reaches the registry on
 * the next publish run - no hand-written entry needed.
 *
 * Schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
 * (name pattern ^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$; description max 100 chars;
 * remote transports carry a variables map and headers whose values may
 * reference those variables with {curly_braces}.)
 */

const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const NAMESPACE = "io.github.pollinations";
const ENTRY_VERSION = "1.0.0"; // bump when the hosted servers' tools change materially
const SETUP_DOCS_URL = "https://gen.pollinations.ai/docs#tag/mcp-servers";
const API_KEYS_URL = "https://enter.pollinations.ai/keys";
const DESCRIPTION_MAX = 100;
const REPOSITORY = {
    id: "358226004",
    source: "github",
    url: "https://github.com/pollinations/pollinations",
};

/** Fit a source description into the registry's 100-char cap. Prefers the
 * first sentence when the whole text does not fit, then a word boundary. */
function registryDescription(description) {
    const text = String(description || "").trim();
    if (text.length <= DESCRIPTION_MAX) {
        return text;
    }
    const firstSentence = /^([^.]+\.)/.exec(text);
    if (firstSentence && firstSentence[1].length <= DESCRIPTION_MAX) {
        return firstSentence[1].trim();
    }
    const cut = text.slice(0, DESCRIPTION_MAX);
    const boundary = cut.lastIndexOf(" ");
    return (boundary > 0 ? cut.slice(0, boundary) : cut).trim();
}

/** Build one official-registry entry from a hosted server of GET /mcp. */
function buildServerEntry(server) {
    if (!server || typeof server.id !== "string" || !server.id) {
        throw new Error("server.id is required");
    }
    if (!/^[a-z0-9-]+$/.test(server.id)) {
        throw new Error(`server.id must be lowercase letters, digits and dashes: ${server.id}`);
    }
    if (typeof server.url !== "string" || !/^https:\/\//.test(server.url)) {
        throw new Error(`server.url must be an https URL: ${server.id}`);
    }
    const entry = {
        $schema: SCHEMA_URL,
        name: `${NAMESPACE}/${server.id}`,
        title: server.name || server.id,
        description: registryDescription(server.description),
        version: ENTRY_VERSION,
        websiteUrl: SETUP_DOCS_URL,
        repository: REPOSITORY,
        remotes: [
            {
                type: "streamable-http",
                url: server.url,
                headers: [
                    {
                        name: "Authorization",
                        value: "Bearer {api_key}",
                        description: `Pollinations API key (${API_KEYS_URL}). Billed to your own account.`,
                        isRequired: true,
                        isSecret: true,
                        placeholder: "sk_...",
                    },
                ],
                variables: {
                    api_key: {
                        description: `Pollinations API key from ${API_KEYS_URL}`,
                        isRequired: true,
                        isSecret: true,
                        placeholder: "sk_...",
                    },
                },
            },
        ],
    };
    validateEntry(entry);
    return entry;
}

/** Structural validation of the registry's documented constraints. */
function validateEntry(entry) {
    const problems = [];
    if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(String(entry.name || ""))) {
        problems.push(`name must be reverse-DNS with exactly one slash: ${entry.name}`);
    }
    if (!entry.name || !entry.name.startsWith(`${NAMESPACE}/`)) {
        problems.push(`name must live under ${NAMESPACE}/: ${entry.name}`);
    }
    const description = String(entry.description || "");
    if (description.length < 1 || description.length > DESCRIPTION_MAX) {
        problems.push(`description must be 1-${DESCRIPTION_MAX} chars, got ${description.length}: ${entry.name}`);
    }
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(String(entry.version || ""))) {
        problems.push(`version must be semantic: ${entry.version}`);
    }
    if (entry.websiteUrl !== SETUP_DOCS_URL) {
        problems.push(`websiteUrl must link the setup docs (${SETUP_DOCS_URL})`);
    }
    const remotes = Array.isArray(entry.remotes) ? entry.remotes : [];
    if (remotes.length !== 1 || remotes[0].type !== "streamable-http" || !/^https:\/\//.test(remotes[0].url || "")) {
        problems.push(`expected one streamable-http https remote: ${entry.name}`);
    } else {
        const header = (remotes[0].headers || []).find((h) => h.name === "Authorization");
        if (!header || header.value !== "Bearer {api_key}" || header.isRequired !== true || header.isSecret !== true) {
            problems.push(`expected a required secret Authorization header templated as Bearer {api_key}: ${entry.name}`);
        }
        if (!remotes[0].variables || !remotes[0].variables.api_key || !remotes[0].variables.api_key.description.includes(API_KEYS_URL)) {
            problems.push(`expected an api_key variable pointing at ${API_KEYS_URL}: ${entry.name}`);
        }
    }
    if (problems.length > 0) {
        throw new Error(`invalid registry entry: ${problems.join("; ")}`);
    }
    return true;
}

/** All registry constraints checked against every committed server file. */
function validateServersDirectory(serversDir, readdirSync, readFileSync) {
    const files = readdirSync(serversDir).filter((name) => name.endsWith(".server.json"));
    if (files.length === 0) {
        throw new Error("no *.server.json files found");
    }
    for (const file of files) {
        validateEntry(JSON.parse(readFileSync(`${serversDir}/${file}`, "utf8")));
    }
    return files.map((file) => file.replace(/\.server\.json$/, ""));
}

module.exports = {
    SCHEMA_URL,
    NAMESPACE,
    ENTRY_VERSION,
    SETUP_DOCS_URL,
    API_KEYS_URL,
    REPOSITORY,
    registryDescription,
    buildServerEntry,
    validateEntry,
    validateServersDirectory,
};
