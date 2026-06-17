import { describe, expect, it } from "vitest";
import { createSystemPromptTransform } from "@/text/transforms/createSystemPromptTransform.ts";

describe("createSystemPromptTransform", () => {
    it("injects the default system prompt when none is present", async () => {
        const t = createSystemPromptTransform("you are helpful");
        const { messages } = await t([{ role: "user", content: "hi" }], {});
        expect(messages[0]).toEqual({
            role: "system",
            content: "you are helpful",
        });
        expect(messages[1]).toEqual({ role: "user", content: "hi" });
    });

    it("leaves a user-supplied system prompt untouched", async () => {
        const t = createSystemPromptTransform("default");
        const { messages } = await t(
            [
                { role: "system", content: "custom" },
                { role: "user", content: "hi" },
            ],
            {},
        );
        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({ role: "system", content: "custom" });
    });

    it("allows an empty string and injects an empty system message", async () => {
        // Empty system message displaces the coding-agent persona some
        // Airforce-resold models default to, without billable tokens.
        const t = createSystemPromptTransform("");
        const { messages } = await t([{ role: "user", content: "hi" }], {});
        expect(messages[0]).toEqual({ role: "system", content: "" });
    });

    it("does not inject when the user already sent a system message (empty default)", async () => {
        const t = createSystemPromptTransform("");
        const { messages } = await t(
            [
                { role: "system", content: "pirate" },
                { role: "user", content: "hi" },
            ],
            {},
        );
        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({ role: "system", content: "pirate" });
    });

    it("still rejects a non-string default", () => {
        expect(() =>
            createSystemPromptTransform(undefined as unknown as string),
        ).toThrow();
    });
});
