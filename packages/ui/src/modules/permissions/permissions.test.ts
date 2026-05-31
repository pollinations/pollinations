import { describe, expect, it } from "vitest";
import { getPermissionUiTheme } from "./index.ts";

describe("permissions", () => {
    it("returns package-prefixed recipes", () => {
        const amber = getPermissionUiTheme("amber");

        expect(amber.row.selectedClasses).toContain("polli:border-amber-400");
        expect(amber.accent.actionTextClasses).toContain(
            "polli:text-amber-800",
        );
    });
});
