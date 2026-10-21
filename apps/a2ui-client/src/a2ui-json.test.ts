import assert from "node:assert/strict";
import { test } from "node:test";
import { splitReply } from "./a2ui-json.ts";

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
