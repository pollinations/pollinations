import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    MCP_SERVERS,
    type McpServerDefinition,
} from "../../shared/registry/mcp.ts";
import { entryFilePath, parseArgs, writeRegistryEntries } from "./emit.mts";
import {
    API_KEY_HEADER,
    API_KEY_URL,
    buildRegistryEntries,
    DEFAULT_VERSION,
    MAX_DESCRIPTION_LENGTH,
    MCP_GATEWAY_BASE_URL,
    mcpGatewayUrl,
    PUBLISHER_META_KEY,
    REGISTRY_NAMESPACE,
    REGISTRY_SCHEMA_URL,
    REPOSITORY_SUBFOLDER,
    REPOSITORY_URL,
    SETUP_DOCS_URL,
    toRegistryEntry,
} from "./entries.mts";

type Entry = ReturnType<typeof toRegistryEntry>;

const REGISTRY_NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

function serverId(entry: Entry): string {
    return entry.name.slice(entry.name.indexOf("/") + 1);
}

function fakeServer(
    overrides: Partial<McpServerDefinition> = {},
): McpServerDefinition {
    return {
        id: "fake",
        name: "Fake",
        description: "A fake server used to exercise the guards.",
        ...overrides,
    } as McpServerDefinition;
}

test("publishes one entry per hosted MCP server", () => {
    const entries = buildRegistryEntries();

    assert.equal(entries.length, MCP_SERVERS.length);
    assert.deepEqual(
        entries.map((entry) => entry.name),
        MCP_SERVERS.map((server) => `${REGISTRY_NAMESPACE}/${server.id}`),
    );
    assert.equal(
        new Set(entries.map((entry) => entry.name)).size,
        entries.length,
        "registry names have to be unique",
    );
});

test("keeps every server name inside the pollinations namespace", () => {
    for (const entry of buildRegistryEntries()) {
        assert.match(entry.name, REGISTRY_NAME_PATTERN);
        assert.ok(entry.name.startsWith(`${REGISTRY_NAMESPACE}/`), entry.name);
        assert.equal(serverId(entry).length > 0, true);
    }
});

test("stays within the registry field limits", () => {
    for (const entry of buildRegistryEntries()) {
        assert.equal(entry.$schema, REGISTRY_SCHEMA_URL);
        assert.ok(entry.version.length > 0, `${entry.name} needs a version`);
        assert.ok(
            entry.title.length > 0 &&
                entry.title.length <= MAX_DESCRIPTION_LENGTH,
            `${entry.name} title is ${entry.title.length} characters`,
        );
        assert.ok(
            entry.description.length > 0 &&
                entry.description.length <= MAX_DESCRIPTION_LENGTH,
            `${entry.name} description is ${entry.description.length} characters`,
        );
    }
});

test("points at the hosted streamable-http endpoint and requires an API key", () => {
    for (const entry of buildRegistryEntries()) {
        const id = serverId(entry);

        assert.equal(entry.remotes.length, 1);
        const [remote] = entry.remotes;
        assert.equal(remote.type, "streamable-http");
        assert.equal(remote.url, mcpGatewayUrl(id));
        assert.equal(remote.url, `${MCP_GATEWAY_BASE_URL}/${id}`);
        assert.ok(remote.url.startsWith("https://"), remote.url);

        assert.equal(remote.headers.length, 1);
        const [header] = remote.headers;
        assert.equal(header.name, API_KEY_HEADER);
        assert.equal(header.isRequired, true);
        assert.equal(header.isSecret, true);
        assert.ok(
            header.description.includes(API_KEY_URL),
            `${entry.name} header has to say where to get an API key`,
        );
    }
});

test("links the setup docs and the source repository", () => {
    for (const entry of buildRegistryEntries()) {
        assert.equal(entry.websiteUrl, SETUP_DOCS_URL);
        assert.deepEqual(entry.repository, {
            url: REPOSITORY_URL,
            source: "github",
            subfolder: REPOSITORY_SUBFOLDER,
        });
    }
});

test("distinguishes third party servers hosted by the gateway", () => {
    const entries = new Map(
        buildRegistryEntries().map((entry) => [serverId(entry), entry]),
    );

    assert.equal(entries.get("pollinations")?.title, "Pollinations MCP");
    assert.ok(entries.get("exa")?.title.includes("via Pollinations"));

    const composio = entries.get("composio");
    assert.ok(composio);
    assert.ok(composio.description.length <= MAX_DESCRIPTION_LENGTH);
    assert.notEqual(
        composio.description,
        MCP_SERVERS.find((server) => server.id === "composio")?.description,
    );

    for (const server of MCP_SERVERS) {
        const entry = entries.get(server.id);
        assert.ok(entry);
        if (server.id !== "composio") {
            assert.equal(entry.description, server.description);
        }
    }
});

test("refuses entries the registry would reject", () => {
    assert.throws(
        () => toRegistryEntry(fakeServer({ description: "x".repeat(120) })),
        /registry accepts 100/,
    );
    assert.throws(
        () => toRegistryEntry(fakeServer({ description: "" })),
        /requires a description/,
    );
    assert.throws(
        () => toRegistryEntry(fakeServer(), { version: "" }),
        /requires a version/,
    );
});

test("honours a caller supplied version", () => {
    const server = MCP_SERVERS[0];
    assert.equal(toRegistryEntry(server).version, DEFAULT_VERSION);
    assert.equal(
        toRegistryEntry(server, { version: "2.0.0" }).version,
        "2.0.0",
    );
    for (const entry of buildRegistryEntries({ version: "2026.9.29" })) {
        assert.equal(entry.version, "2026.9.29");
    }
});

test("adds publisher metadata only when a commit is given", () => {
    for (const entry of buildRegistryEntries()) {
        assert.equal(entry._meta, undefined);
    }

    const generatedAt = "2026-09-29T00:00:00.000Z";
    const [entry] = buildRegistryEntries({ commit: "abc123", generatedAt });

    assert.deepEqual(entry._meta, {
        [PUBLISHER_META_KEY]: {
            source: REPOSITORY_URL,
            commit: "abc123",
            generatedAt,
        },
    });
});

test("writes one server.json per entry", () => {
    const out = mkdtempSync(join(tmpdir(), "mcp-registry-"));
    try {
        const entries = buildRegistryEntries({ version: "1.2.3" });
        const files = writeRegistryEntries(entries, out);

        assert.deepEqual(
            files,
            entries.map((entry) => entryFilePath(out, entry)),
        );

        for (const [index, file] of files.entries()) {
            assert.ok(existsSync(file), `${file} has to exist`);
            const contents = readFileSync(file, "utf8");
            assert.ok(contents.endsWith("\n"));
            assert.deepEqual(JSON.parse(contents), entries[index]);
        }
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});

test("rejects unknown arguments and a missing output directory", () => {
    assert.throws(() => parseArgs([]), /--out is required/);
    assert.throws(() => parseArgs(["--out"]), /--out needs a value/);
    assert.throws(() => parseArgs(["--nope", "x"]), /Unknown argument/);

    assert.deepEqual(
        parseArgs(["--out", "/tmp/entries", "--version", "9.9.9"]),
        {
            out: "/tmp/entries",
            version: "9.9.9",
        },
    );
});
