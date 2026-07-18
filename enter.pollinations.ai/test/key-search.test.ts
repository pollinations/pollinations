import { describe, expect, it } from "vitest";
import { validateKeySearch } from "../frontend/src/components/keys/key-search.ts";

describe("validateKeySearch", () => {
    it("selects the app key view", () => {
        expect(validateKeySearch({ view: "apps" })).toEqual({
            view: "apps",
        });
    });

    it("ignores unknown key views", () => {
        expect(validateKeySearch({ view: "other" }).view).toBeUndefined();
    });
});
