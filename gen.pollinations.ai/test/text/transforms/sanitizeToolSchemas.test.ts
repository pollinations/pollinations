import { describe, expect, it } from "vitest";
import { sanitizeToolSchemas } from "../../../src/text/transforms/sanitizeToolSchemas.js";

type FunctionTool = {
    function?: {
        name?: string;
        parameters?: unknown;
    };
};

describe("sanitizeToolSchemas", () => {
    const transform = sanitizeToolSchemas();

    it("removes unsupported bounds while preserving supported schema fields", async () => {
        const result = await transform([], {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                count: {
                                    type: "integer",
                                    exclusiveMinimum: 0,
                                    exclusiveMaximum: 100,
                                    default: 10,
                                },
                            },
                        },
                    },
                },
            ],
        });

        const tools = result.options.tools as FunctionTool[];
        const params = tools[0].function?.parameters as {
            properties: {
                count: Record<string, unknown>;
            };
        };

        expect(params.properties.count.exclusiveMinimum).toBeUndefined();
        expect(params.properties.count.exclusiveMaximum).toBeUndefined();
        expect(params.properties.count.type).toBe("integer");
        expect(params.properties.count.default).toBe(10);
    });

    it("sanitizes nested object and array schemas", async () => {
        const result = await transform([], {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                nested: {
                                    type: "object",
                                    properties: {
                                        value: {
                                            type: "number",
                                            exclusiveMinimum: 0,
                                        },
                                    },
                                },
                                items: {
                                    type: "array",
                                    items: {
                                        type: "number",
                                        exclusiveMaximum: 100,
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        });

        const tools = result.options.tools as FunctionTool[];
        const params = tools[0].function?.parameters as {
            properties: {
                nested: { properties: { value: Record<string, unknown> } };
                items: { items: Record<string, unknown> };
            };
        };

        expect(
            params.properties.nested.properties.value.exclusiveMinimum,
        ).toBeUndefined();
        expect(params.properties.nested.properties.value.type).toBe("number");
        expect(params.properties.items.items.exclusiveMaximum).toBeUndefined();
        expect(params.properties.items.items.type).toBe("number");
    });

    it("removes unsupported schema properties", async () => {
        const result = await transform([], {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                config: {
                                    type: "object",
                                    patternProperties: {
                                        "^x-": { type: "string" },
                                    },
                                },
                                value: {
                                    type: "string",
                                    customExtension: true,
                                    "x-custom": "foo",
                                },
                            },
                        },
                    },
                },
            ],
        });

        const tools = result.options.tools as FunctionTool[];
        const params = tools[0].function?.parameters as {
            properties: {
                config: Record<string, unknown>;
                value: Record<string, unknown>;
            };
        };

        expect(params.properties.config.patternProperties).toBeUndefined();
        expect(params.properties.value.customExtension).toBeUndefined();
        expect(params.properties.value["x-custom"]).toBeUndefined();
        expect(params.properties.value.type).toBe("string");
    });

    it("passes through tools without parameters and preserves messages", async () => {
        const messages = [{ role: "user" as const, content: "test" }];
        const result = await transform(messages, {
            tools: [
                {
                    type: "function",
                    function: { name: "simple_tool" },
                },
            ],
        });

        expect(result.messages).toEqual(messages);
        const tools = result.options.tools as FunctionTool[];
        expect(tools[0].function?.name).toBe("simple_tool");
        expect((await transform(messages, {})).options.tools).toBeUndefined();
    });
});
