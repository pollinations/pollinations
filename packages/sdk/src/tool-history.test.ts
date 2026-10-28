import { expect, it } from "vitest";
import { Pollinations } from "./client.js";
import type { ChatChoice, Message, ToolCall } from "./types.js";

it("accepts a returned assistant tool call in the next chat turn", () => {
    const tool: ToolCall = {
        id: "call_1",
        type: "function",
        function: { name: "weather", arguments: "{}" },
    };
    const choice: ChatChoice = {
        index: 0,
        finish_reason: "tool_calls",
        message: { role: "assistant", content: null, tool_calls: [tool] },
    };
    const messages: Message[] = [
        { role: "user", content: "What is the weather?" },
        choice.message,
        { role: "tool", tool_call_id: "call_1", content: "Sunny" },
    ];
    const direct: Message = {
        role: "assistant",
        content: null,
        tool_calls: [tool],
    };
    expect(messages[1]).toEqual(direct);
    const client = new Pollinations({ apiKey: "sk_test" });
    // Ensure the same typed history is accepted by both public request methods.
    const chat: Parameters<typeof client.chat>[0] = messages;
    const stream: Parameters<typeof client.chatStream>[0] = messages;
    expect(chat).toBe(stream);
});
