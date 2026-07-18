import { describe, expect, it } from "vitest";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

describe("validateModelSearch", () => {
    it("selects the owner model view", () => {
        expect(validateModelSearch({ view: "mine" })).toEqual({
            view: "mine",
            category: undefined,
            q: undefined,
            sort: undefined,
            dir: undefined,
        });
    });

    it("ignores unknown model views", () => {
        expect(validateModelSearch({ view: "other" }).view).toBeUndefined();
    });
});
