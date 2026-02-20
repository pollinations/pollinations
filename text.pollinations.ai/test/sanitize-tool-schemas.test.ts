import { describe, it, expect } from "vitest";
import { sanitizeToolSchemas } from "../transforms/sanitizeToolSchemas.js";

describe("sanitizeToolSchemas transform", () => {
    const transform = sanitizeToolSchemas();

    it("should remove exclusiveMinimum from tool parameters", () => {
        const options = {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                count: { type: "integer", exclusiveMinimum: 0 },
                            },
                        },
                    },
                },
            ],
        };

        const result = transform([], options);
        const params = result.options.tools[0].function.parameters;

        expect(params.properties.count.exclusiveMinimum).toBeUndefined();
        expect(params.properties.count.type).toBe("integer");
    });

    it("should remove exclusiveMaximum from tool parameters", () => {
        const options = {
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
                                    exclusiveMaximum: 100,
                                },
                            },
                        },
                    },
                },
            ],
        };

        const result = transform([], options);
        const params = result.options.tools[0].function.parameters;

        expect(params.properties.count.exclusiveMaximum).toBeUndefined();
    });

    it("should preserve default (supported by Vertex AI)", () => {
        const options = {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                count: { type: "integer", default: 10 },
                            },
                        },
                    },
                },
            ],
        };

        const result = transform([], options);
        const params = result.options.tools[0].function.parameters;

        expect(params.properties.count.default).toBe(10);
    });

    it("should handle nested objects", () => {
        const options = {
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
                                            exclusiveMaximum: 100,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        };

        const result = transform([], options);
        const nested =
            result.options.tools[0].function.parameters.properties.nested;

        expect(nested.properties.value.exclusiveMinimum).toBeUndefined();
        expect(nested.properties.value.exclusiveMaximum).toBeUndefined();
        expect(nested.properties.value.type).toBe("number");
    });

    it("should handle arrays in schema", () => {
        const options = {
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test",
                        parameters: {
                            type: "object",
                            properties: {
                                items: {
                                    type: "array",
                                    items: {
                                        type: "number",
                                        exclusiveMinimum: 0,
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        };

        const result = transform([], options);
        const items =
            result.options.tools[0].function.parameters.properties.items;

        expect(items.items.exclusiveMinimum).toBeUndefined();
        expect(items.items.type).toBe("number");
    });

    it("should pass through tools without parameters", () => {
        const options = {
            tools: [
                {
                    type: "function",
                    function: { name: "simple_tool" },
                },
            ],
        };

        const result = transform([], options);

        expect(result.options.tools[0].function.name).toBe("simple_tool");
    });

    it("should handle undefined tools", () => {
        const result = transform([], {});

        expect(result.options.tools).toBeUndefined();
    });

    it("should preserve messages unchanged", () => {
        const messages = [{ role: "user", content: "test" }];
        const result = transform(messages, {});

        expect(result.messages).toEqual(messages);
    });
});
