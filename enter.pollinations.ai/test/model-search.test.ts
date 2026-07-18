import { describe, expect, it } from "vitest";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

describe("validateModelSearch", () => {
    it("ignores obsolete view parameters", () => {
        expect(validateModelSearch({ view: "mine" })).toEqual({
            category: undefined,
            q: undefined,
            sort: undefined,
            dir: undefined,
        });
    });
});
