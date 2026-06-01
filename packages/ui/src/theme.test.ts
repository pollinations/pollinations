import { describe, expect, it } from "vitest";
import { themeColors, themes } from "./theme.ts";

describe("themeColors", () => {
    it("exposes amber as the React UI brand color (bg-pale token as hex)", () => {
        expect(themeColors.amber).toBe("#FEF3C7");
    });

    it("only lists colors for known theme names", () => {
        for (const name of Object.keys(themeColors)) {
            expect(themes).toContain(name);
        }
    });
});
