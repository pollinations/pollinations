import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

async function connectClient() {
    const stored = new Map();
    const DIAGRAMS = {
        get: async (key, type) =>
            stored.has(key) && type === "json"
                ? JSON.parse(stored.get(key))
                : (stored.get(key) ?? null),
        put: async (key, value) => stored.set(key, value),
    };
    const client = new Client(
        { name: "excalidraw-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, versionNegotiation: { mode: "auto" } },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://mcp.internal/"), {
            fetch: (input, init) =>
                worker.fetch(new Request(input, init), { DIAGRAMS }),
        }),
    );
    return client;
}

test("links create_view to the pinned upstream widget", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(({ name }) => name).sort(), [
        "create_view",
        "export_to_excalidraw",
        "read_checkpoint",
        "read_me",
        "save_checkpoint",
    ]);

    const uri = tools.find(({ name }) => name === "create_view")._meta.ui
        .resourceUri;
    const [view] = (await client.readResource({ uri })).contents;
    assert.equal(view.mimeType, "text/html;profile=mcp-app");
    assert.deepEqual(view._meta.ui.csp.resourceDomains, ["https://esm.sh"]);
    assert.match(
        view.text,
        /esm\.sh\/\*gh\/excalidraw\/excalidraw-mcp@[0-9a-f]{40}\//,
    );
    await client.close();
});

test("edits a diagram from its KV checkpoint", async () => {
    const client = await connectClient();
    const draw = (elements) =>
        client.callTool({
            name: "create_view",
            arguments: { elements: JSON.stringify(elements) },
        });
    const box = (id) => ({
        type: "rectangle",
        id,
        x: 0,
        y: 0,
        width: 120,
        height: 60,
    });

    const first = await draw([
        { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
        box("b1"),
        box("b2"),
        { type: "text", id: "t2", containerId: "b2", text: "gone" },
    ]);
    const edited = await draw([
        { type: "restoreCheckpoint", id: first.structuredContent.checkpointId },
        { type: "delete", ids: "b2" },
        box("b3"),
    ]);
    const saved = await client.callTool({
        name: "read_checkpoint",
        arguments: { id: edited.structuredContent.checkpointId },
    });
    assert.deepEqual(
        JSON.parse(saved.content[0].text).elements.map(
            (el) => el.id ?? el.type,
        ),
        ["cameraUpdate", "b1", "b3"],
    );

    const missing = await draw([{ type: "restoreCheckpoint", id: "gone" }]);
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /not found/);
    await client.close();
});
