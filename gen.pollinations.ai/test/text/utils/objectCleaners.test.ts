import { describe, expect, it } from "vitest";
import { cleanNullAndUndefined } from "../../../src/text/utils/objectCleaners.js";

describe("cleanNullAndUndefined", () => {
    it("strips only top-level null and undefined values", () => {
        expect(
            cleanNullAndUndefined({
                audio: null,
                modalities: null,
                response_format: null,
                temperature: null,
                top_p: undefined,
                tools: [
                    {
                        type: "function",
                        function: {
                            parameters: {
                                type: "object",
                                properties: {
                                    value: { default: null },
                                },
                            },
                        },
                    },
                ],
                nested: {
                    keepNull: null,
                    keepUndefined: undefined,
                },
            }),
        ).toEqual({
            tools: [
                {
                    type: "function",
                    function: {
                        parameters: {
                            type: "object",
                            properties: {
                                value: { default: null },
                            },
                        },
                    },
                },
            ],
            nested: {
                keepNull: null,
                keepUndefined: undefined,
            },
        });
    });
});
