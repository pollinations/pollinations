import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no types
import { generatePalette } from "../scripts/gen-theme-palette.mjs";
import committed from "./theme-palette.json";

// theme-palette.json is a generated mirror of each theme's LIGHT bg-pale (hue
// from tokens.css, L/C from the recipe). It must never drift from the CSS — the
// icon tooling reads it. If this fails, run `npm run build:palette`.
describe("theme-palette.json", () => {
    it("matches the palette derived from tokens.css", async () => {
        expect(committed).toEqual(await generatePalette());
    });
});
