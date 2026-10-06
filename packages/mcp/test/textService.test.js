import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { textTools } from "../src/services/textService.js";

test("generateText accepts assistant tool calls with null content for tool-use continuation", () => {
    const shape = textTools.find(([name]) => name === "generateText")[2];
    const messages = [
        { role: "user", content: "What is the weather?" },
        {
            role: "assistant",
            content: null,
            tool_calls: [
                {
                    id: "call_1",
                    type: "function",
                    function: { name: "weather", arguments: "{}" },
                },
            ],
        },
        { role: "tool", tool_call_id: "call_1", content: "Sunny" },
    ];
    const result = z.object(shape).safeParse({ messages });
    assert.equal(
        result.success,
        true,
        "Tool-use continuation must be accepted",
    );
    assert.deepEqual(result.data.messages, messages);
});
