import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

async function transformOf(name: string) {
    const transform = findModelByName(name)?.transform;
    if (!transform) throw new Error(`${name} transform missing`);
    return transform;
}

describe("reasoning_effort levels the GPT-6 and GPT-5.6 families reject", () => {
    it.each([
        "openai/gpt-6.1-terra",
        "openai/gpt-6.1-sol",
        "openai/gpt-5.3-codex",
        "openai/gpt-6-luna",
        "openai/gpt-6-sol",
        "openai/gpt-6-astra",
        "openai/gpt-5.6-luna",
        "openai/gpt-5.6-sol",
        "openai/gpt-5.6-terra",
        "openai/gpt-5.5",
        "openai/gpt-oss-20b",
        "pollinations/midijourney-large",
    ])("maps minimal to low for %s", async (name) => {
        const transform = await transformOf(name);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "minimal",
        });
        expect(options.reasoning_effort).toBe("low");
    });

    it.each([
        "openai/gpt-5.4",
        "openai/gpt-5-nano",
        "pollinations/midijourney",
    ])("maps max to xhigh for %s", async (name) => {
        const transform = await transformOf(name);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "max",
        });
        expect(options.reasoning_effort).toBe("xhigh");
    });

    it("leaves supported levels and an omitted value alone", async () => {
        const minimal = await transformOf("openai/gpt-6.1-terra");
        for (const effort of [
            "none",
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
        ]) {
            const { options } = await minimal([], {
                reasoning_effort: effort,
            });
            expect(options.reasoning_effort).toBe(effort);
        }

        const max = await transformOf("openai/gpt-5.4");
        for (const effort of ["none", "low", "medium", "high", "xhigh"]) {
            const { options } = await max([], { reasoning_effort: effort });
            expect(options.reasoning_effort).toBe(effort);
        }

        const omitted = await minimal([], {});
        expect(omitted.options).not.toHaveProperty("reasoning_effort");
    });

    it("matches the level case-insensitively", async () => {
        const transform = await transformOf("openai/gpt-6.1-terra");
        const { options } = await transform([], {
            reasoning_effort: "MINIMAL",
        });
        expect(options.reasoning_effort).toBe("low");
    });
});
