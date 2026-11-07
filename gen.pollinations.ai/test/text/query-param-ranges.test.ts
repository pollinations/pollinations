import { describe, expect, it } from "vitest";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";

describe("GenerateTextRequestQueryParamsSchema sampling ranges", () => {
    it.each([
        ["top_p", "2"],
        ["top_p", "-1"],
        ["presence_penalty", "5"],
        ["presence_penalty", "-5"],
        ["frequency_penalty", "5"],
        ["frequency_penalty", "-5"],
        ["repetition_penalty", "-1"],
        ["repetition_penalty", "5"],
        ["seed", "99999999999"],
    ])("rejects out-of-range %s=%s", (key, value) => {
        const result = GenerateTextRequestQueryParamsSchema.safeParse({
            [key]: value,
        });

        expect(result.success).toBe(false);
    });

    it.each([
        ["top_p", "0"],
        ["top_p", "1"],
        ["presence_penalty", "-2"],
        ["frequency_penalty", "2"],
        ["repetition_penalty", "0"],
        ["repetition_penalty", "2"],
        ["seed", "-1"],
        ["seed", "2147483647"],
    ])("accepts in-range %s=%s", (key, value) => {
        const result = GenerateTextRequestQueryParamsSchema.safeParse({
            [key]: value,
        });

        expect(result.success).toBe(true);
    });
});
