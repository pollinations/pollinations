import { expect, it } from "vitest";
import { createMessageTransform } from "../../../src/text/transforms/createMessageTransform.js";

it("merges system messages sent as text parts", async () => {
    const transform = createMessageTransform("Music persona");
    const { messages } = await transform(
        [
            {
                role: "system",
                content: [
                    { type: "text", text: "Compose in D-flat major" },
                    { type: "text", text: "Use 7/8 time" },
                ],
            },
            { role: "user", content: "Four bars" },
        ],
        {},
    );
    expect(messages[0].content).toBe(
        "Music persona\n\nCompose in D-flat major\nUse 7/8 time",
    );
});
