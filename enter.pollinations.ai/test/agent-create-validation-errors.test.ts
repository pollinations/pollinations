import { unwrapUnionIssues } from "@shared/error.ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CreateAgentSchema } from "../src/routes/agents.ts";

function fieldErrors(body: unknown) {
    const result = CreateAgentSchema.safeParse(body);
    if (result.success) throw new Error("expected validation to fail");
    return z.flattenError(
        new z.ZodError(unwrapUnionIssues(result.error.issues)),
    );
}

const promptAgent = {
    name: "qa-union-check",
    title: "QA Union Check",
    systemPrompt: "Say OK",
    baseModel: "openai/gpt-5.4-nano",
};

describe("POST /account/agents validation errors", () => {
    it("names the invalid mcpServers entry instead of 'Invalid input'", () => {
        const flat = fieldErrors({
            ...promptAgent,
            mcpServers: ["not-a-server"],
        });
        expect(flat.formErrors).toEqual([]);
        expect(Object.keys(flat.fieldErrors)).toEqual(["mcpServers"]);
        expect(flat.fieldErrors.mcpServers?.[0]).toMatch(/expected one of/);
    });

    it("names a missing repository on a code agent", () => {
        const flat = fieldErrors({
            name: "code-agent",
            title: "Code Agent",
            type: "code_agent",
        });
        expect(flat.fieldErrors).toHaveProperty("repository");
        expect(flat.formErrors).not.toContain("Invalid input");
    });

    it("names the offending field when a prompt agent name is too long", () => {
        const flat = fieldErrors({
            ...promptAgent,
            name: "x".repeat(121),
            mcpServers: [],
        });
        expect(flat.fieldErrors).toHaveProperty("name");
    });

    it("leaves non-union issues untouched", () => {
        const issues = [
            { code: "custom", path: ["a"], message: "bad" },
        ] as z.core.$ZodIssue[];
        expect(unwrapUnionIssues(issues)).toEqual(issues);
    });
});
