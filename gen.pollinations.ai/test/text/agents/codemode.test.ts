import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CodeMode } from "../../../src/text/agents/codemode.ts";

// The test workerd predates WorkerLoader.load(); a fresh get() ID gives the
// same one-off Dynamic Worker.
const LOADER = {
    get: (name, getCode) => env.LOADER.get(name, getCode),
    load: (code) => env.LOADER.get(crypto.randomUUID(), () => code),
} as WorkerLoader;

describe("CodeMode", () => {
    it("runs code agent JavaScript against the agent's own tools", async () => {
        const calls: unknown[] = [];
        const codemode = new CodeMode(createExecutionContext(), {
            ...env,
            LOADER,
        });
        const code = await codemode.tool({
            search: {
                description: "Search the web",
                inputSchema: {
                    type: "object",
                    properties: { query: { type: "string" } },
                    required: ["query"],
                },
                execute: async (input) => {
                    calls.push(input);
                    const { query } = input as { query: string };
                    return {
                        content: [{ type: "text", text: `found ${query}` }],
                    };
                },
            },
            add: {
                inputSchema: {
                    type: "object",
                    properties: {
                        a: { type: "number" },
                        b: { type: "number" },
                    },
                },
                execute: async (input) => {
                    const { a, b } = input as { a: number; b: number };
                    return a + b;
                },
            },
        });

        expect(code.description).toContain("search");
        expect(code.description).toContain("Search the web");
        expect(code.inputSchema).toMatchObject({
            properties: { code: { type: "string" } },
        });
        const result = await code.execute({
            code: `async () => {
                const pages = await Promise.all(["a", "b"].map((query) => codemode.search({ query })));
                return { pages, sum: await codemode.add({ a: 2, b: 3 }) };
            }`,
        });
        expect(result).toEqual({
            result: { pages: ["found a", "found b"], sum: 5 },
        });
        expect(calls).toEqual([{ query: "a" }, { query: "b" }]);
    });
});
