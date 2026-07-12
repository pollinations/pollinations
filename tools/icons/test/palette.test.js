import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const UI_ROOT = dirname(require.resolve("@pollinations/ui/package.json"));

const palette = JSON.parse(
    await readFile(join(UI_ROOT, "src/theme-palette.json"), "utf8"),
);
const tokensCss = await readFile(
    join(UI_ROOT, "src/styles/tokens.css"),
    "utf8",
);

// The set of themes the palette claims a brand color for must match exactly the
// set of `[data-theme]` cascades that define `--polli-color-bg-pale` in
// tokens.css. This catches a theme being added, removed, or renamed in one
// place but not the other — the drift the JSON mirror could otherwise hide.
// (Value-level oklch↔hex parity is not asserted here: tokens.css is the source
//  of truth for the running UI, and the hex mirror is updated alongside it.)
test("palette themes match the theme cascades in tokens.css", () => {
    const cssThemes = new Set();
    const re = /\[data-theme="([a-z]+)"\][^}]*--polli-color-bg-pale/g;
    for (const [, name] of tokensCss.matchAll(re)) cssThemes.add(name);

    assert.deepEqual(
        Object.keys(palette.bgPale).sort(),
        [...cssThemes].sort(),
        "theme-palette.json bgPale keys must match tokens.css [data-theme] bg-pale declarations",
    );
});

test("every palette color is a hex string and brandDark is set", () => {
    for (const [name, hex] of Object.entries(palette.bgPale)) {
        assert.match(hex, /^#[0-9a-fA-F]{6}$/, `${name} must be a 6-digit hex`);
    }
    assert.match(palette.brandDark, /^#[0-9a-fA-F]{6}$/);
});
