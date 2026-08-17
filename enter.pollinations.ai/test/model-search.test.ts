import { describe, expect, it } from "vitest";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

describe("model catalog search", () => {
    it("allows the agent category in both catalog scopes", () => {
        expect(validateModelSearch({ category: "agent" })).toEqual({
            scope: undefined,
            category: "agent",
            q: undefined,
            sort: undefined,
        });
        expect(
            validateModelSearch({ scope: "community", category: "agent" }),
        ).toEqual({
            scope: "community",
            category: "agent",
            q: undefined,
            sort: undefined,
        });
    });
});
