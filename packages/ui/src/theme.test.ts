import { describe, expect, it } from "vitest";
import { themeColors, themes } from "./theme.ts";

describe("themeColors", () => {
    it("exposes the bg-pale token per theme as hex", () => {
        expect(themeColors.amber).toBe("#FEF3C7");
        expect(themeColors.blue).toBe("#DBEAFE");
    });

    it("only lists colors for known theme names", () => {
        for (const name of Object.keys(themeColors)) {
            expect(themes).toContain(name);
        }
    });
});
