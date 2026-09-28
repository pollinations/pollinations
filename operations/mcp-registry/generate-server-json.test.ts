import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_SERVERS } from "../../shared/registry/mcp.ts";
import { buildServerJson } from "./generate-server-json.ts";

const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

test("every server entry satisfies the MCP registry schema constraints", () => {
    for (const server of MCP_SERVERS) {
        const entry = buildServerJson(server, "1.0.0");

        assert.match(entry.name, NAME_PATTERN);
        assert.equal(entry.name, `io.github.pollinations/${server.id}`);
        assert.ok(
            entry.description.length <= 100,
            `${server.id} description exceeds the registry's 100-char limit`,
        );
        assert.equal(entry.remotes.length, 1);

        const [remote] = entry.remotes;
        assert.equal(remote.type, "streamable-http");
        assert.equal(
            remote.url,
            `https://gen.pollinations.ai/mcp/${server.id}`,
        );

        const [header] = remote.headers;
        assert.equal(header.name, "Authorization");
        assert.equal(header.isRequired, true);
        assert.equal(header.isSecret, true);
        assert.match(header.description, /enter\.pollinations\.ai\/keys/);
    }
});
