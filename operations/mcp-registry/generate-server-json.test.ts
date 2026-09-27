import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_SERVERS } from "../../shared/registry/mcp.ts";
import { buildServerEntry } from "./generate-server-json.ts";

// Mirrors the registry's actual server.schema.json constraints (checked
// against the live schema for all six entries — see the PR description).
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

test("every hosted server produces a valid, distinct registry entry", () => {
    const names = new Set<string>();

    for (const server of MCP_SERVERS) {
        const entry = buildServerEntry(server, "2026.9.27");

        assert.match(entry.name, NAME_PATTERN);
        assert.ok(entry.name.length <= 200);
        assert.equal(entry.name, `io.github.pollinations/${server.id}`);
        names.add(entry.name);

        assert.ok(
            entry.description.length > 0 && entry.description.length <= 100,
            `${server.id} description must be 1-100 chars, got ${entry.description.length}`,
        );

        assert.equal(entry.remotes.length, 1);
        const [remote] = entry.remotes;
        assert.equal(remote.type, "streamable-http");
        assert.equal(
            remote.url,
            `https://gen.pollinations.ai/mcp/${server.id}`,
        );

        assert.equal(remote.headers.length, 1);
        const [header] = remote.headers;
        assert.equal(header.name, "Authorization");
        assert.equal(header.isRequired, true);
        assert.equal(header.isSecret, true);
        // The value template supplies the "Bearer " prefix the gateway
        // requires; the client only ever prompts for the raw key.
        assert.equal(header.value, "Bearer {api_key}");
        assert.ok(header.variables.api_key.isRequired);
    }

    assert.equal(names.size, MCP_SERVERS.length, "server ids must be unique");
});
