import { describe, expect, it } from "vitest";
import { themeColors, themes } from "./theme.ts";

describe("themeColors", () => {
    it("only lists colors for known theme names", () => {
        for (const name of Object.keys(themeColors)) {
            expect(themes).toContain(name);
        }
    });
});
