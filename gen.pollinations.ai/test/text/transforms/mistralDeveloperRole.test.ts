import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

function transformOf(name: string) {
    const transform = findModelByName(name)?.transform;
    if (!transform) throw new Error(`${name} transform missing`);
    return transform;
}

describe("Mistral Large 3 developer role", () => {
    it("sends developer as system on the Azure Mistral route", async () => {
        const transform = transformOf("mistralai/mistral-large-3");
        const { messages, options } = await transform(
            [
                { role: "developer", content: "be terse" },
                { role: "user", content: "hi" },
            ],
            { temperature: 0.5 },
        );

        expect(messages).toEqual([
            { role: "system", content: "be terse" },
            { role: "user", content: "hi" },
        ]);
        expect(options).toMatchObject({ temperature: 0.5 });
    });

    it("leaves system, user and assistant messages untouched", async () => {
        const transform = transformOf("mistralai/mistral-large-3");
        const input = [
            { role: "system" as const, content: "be terse" },
            { role: "user" as const, content: "hi" },
            { role: "assistant" as const, content: "hello" },
        ];
        const { messages } = await transform(input, {});
        expect(messages).toEqual(input);
    });

    it("does not rewrite developer on models that accept it", async () => {
        const transform = transformOf("openai/gpt-5.4-nano");
        const input = [
            { role: "developer" as const, content: "be terse" },
            { role: "user" as const, content: "hi" },
        ];
        const { messages } = await transform(input, {});
        expect(messages).toEqual(input);
    });
});
