import { flattenValidationIssues } from "@shared/error.ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirrors CreateAgentSchema in enter.pollinations.ai/src/routes/agents.ts.
const createAgentSchema = z.union([
    z
        .object({ type: z.literal("code_agent"), repository: z.string() })
        .strict(),
    z
        .object({
            name: z.string(),
            systemPrompt: z.string(),
            baseModel: z.string(),
            mcpServers: z
                .array(z.enum(["pollinations", "exa"]))
                .optional()
                .default([]),
        })
        .strict(),
]);

describe("flattenValidationIssues", () => {
    it("names the failing field when a top-level union rejects the body", () => {
        const parsed = createAgentSchema.safeParse({
            name: "qa",
            systemPrompt: "Say OK",
            baseModel: "openai",
            mcpServers: ["not-a-server"],
        });
        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        const flat = flattenValidationIssues(parsed.error);
        expect(flat.fieldErrors.mcpServers?.[0]).toContain("Invalid option");
        expect(flat.fieldErrors.type).toBeUndefined();
    });

    it("leaves non-union errors unchanged", () => {
        const parsed = z
            .object({ name: z.string().min(3) })
            .safeParse({ name: "x" });
        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(flattenValidationIssues(parsed.error).fieldErrors).toEqual({
            name: ["Too small: expected string to have >=3 characters"],
        });
    });
});
