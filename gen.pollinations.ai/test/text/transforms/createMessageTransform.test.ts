import { expect, it } from "vitest";
import { createMessageTransform } from "../../../src/text/transforms/createMessageTransform.js";

it("keeps the client's system messages as sent", async () => {
    const transform = createMessageTransform("Music persona");
    const messages = [
        {
            role: "system",
            content: [
                { type: "text", text: "Compose in D-flat major" },
                { type: "text", text: "Use 7/8 time" },
            ],
        },
        { role: "user", content: "Four bars" },
    ];
    const result = await transform(messages, {});
    expect(result.messages).toEqual([
        { role: "system", content: "Music persona" },
        ...messages,
    ]);
});
