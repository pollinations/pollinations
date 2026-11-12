import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/web_core/v0_9/basic_catalog";
import { applyBlock, splitReply } from "./a2ui-json.ts";

test("separates prose from a closed block", () => {
    const reply =
        'Here you go.\n<a2ui-json>\n[{"version":"v0.9"}]\n</a2ui-json>';
    assert.deepEqual(splitReply(reply), {
        prose: "Here you go.",
        blocks: [{ json: '[{"version":"v0.9"}]', closed: true }],
    });
});

test("strips a markdown fence inside the block", () => {
    const reply = '<a2ui-json>```json\n[{"a":1}]\n```</a2ui-json> done';
    assert.deepEqual(splitReply(reply), {
        prose: "done",
        blocks: [{ json: '[{"a":1}]', closed: true }],
    });
});

test("marks a block that is still streaming as open", () => {
    const { prose, blocks } = splitReply('Hi <a2ui-json>[{"vers');
    assert.equal(prose, "Hi");
    assert.deepEqual(blocks, [{ json: '[{"vers', closed: false }]);
});

test("drops hosted-agent tool-call details from the prose", () => {
    const reply =
        '<details type="tool_calls" name="generateImage">\n<summary>Tool Executed</summary>\n{}\n</details>\nA postcard.<a2ui-json>[]</a2ui-json>';
    assert.equal(splitReply(reply).prose, "A postcard.");
});

test("returns every block in order", () => {
    const { blocks } = splitReply(
        "<a2ui-json>[1]</a2ui-json> and <a2ui-json>[2]</a2ui-json>",
    );
    assert.deepEqual(
        blocks.map((block) => block.json),
        ["[1]", "[2]"],
    );
});

const CATALOG =
    "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
const surface = (...texts: string[]) =>
    JSON.stringify([
        {
            version: "v0.9",
            createSurface: { surfaceId: "main", catalogId: CATALOG },
        },
        {
            version: "v0.9",
            updateComponents: {
                surfaceId: "main",
                components: texts.map((text) => ({
                    id: "root",
                    component: "Text",
                    text,
                })),
            },
        },
    ]);

test("replaces a surface that is created again", () => {
    const processor = new MessageProcessor([basicCatalog]);
    assert.equal(applyBlock(processor, surface("one")), undefined);
    assert.equal(applyBlock(processor, surface("two")), undefined);
    assert.equal(processor.getSurfaces().size, 1);
});

test("reports JSON that does not parse as INVALID_JSON", () => {
    const error = applyBlock(
        new MessageProcessor([basicCatalog]),
        surface("cut off").slice(0, -20),
    );
    assert.equal(error?.code, "INVALID_JSON");
    assert.equal(error?.surfaceId, "main");
});

test("reports A2UI errors with their code", () => {
    const error = applyBlock(
        new MessageProcessor([basicCatalog]),
        surface("a", "b"),
    );
    assert.equal(error?.code, "INTEGRITY_ERROR");
    assert.match(error?.message ?? "", /Duplicate component ID/);
});
