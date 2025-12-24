import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import vm from "node:vm";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync as fsReadFileSync } from "node:fs";

// Basic TS loader for nested requires inside transpiled modules
Module._extensions[".ts"] = (mod, filename) => {
    if (filename.endsWith("pollinationsAPI.ts")) {
        mod.exports = {
            generateText: async () => "",
            generateImage: async () => "",
        };
        return;
    }
    if (filename.endsWith("api.config.ts")) {
        mod.exports = {
            API: {},
            DEFAULTS: {},
            API_KEY: "",
            IS_SECRET_KEY: false,
        };
        return;
    }
    const source = fsReadFileSync(filename, "utf8");
    const { outputText } = transpileModule(source, {
        compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2020,
        },
    });
    mod._compile(outputText, filename);
};

async function importTsModule(relativePath) {
    const url = new URL(relativePath, import.meta.url);
    const source = await readFile(url, "utf8");
    const { outputText } = transpileModule(source, {
        compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2020,
        },
    });

    const filename = fileURLToPath(url);
    const dirname = path.dirname(filename);
    const require = Module.createRequire(filename);

    const moduleExports = {};
    const context = {
        module: { exports: moduleExports },
        exports: moduleExports,
        require,
        __filename: filename,
        __dirname: dirname,
        console,
        process,
        Buffer,
        setTimeout,
        clearTimeout,
    };

    vm.runInNewContext(outputText, context, { filename });
    return context.module.exports;
}

const loadEngine = () => importTsModule("../engine.ts");
const loadStylingHelpers = () =>
    importTsModule("../../guideline-helpers/styling-helpers.ts");

test("processTheme filters invalid tokens and values", async () => {
    const { processTheme } = await loadEngine();

    const theme = {
        slots: {
            slot_0: { hex: "#123456", ids: ["text.primary"] },
            slot_1: { hex: "bad-hex", ids: ["text.secondary"] },
            slot_2: { hex: "#abcdef", ids: ["not.a.token"] },
        },
        borderRadius: {
            "radius.button": "8px",
            "radius.card": "not-a-radius",
        },
        fonts: {
            "font.title": "Inter",
            "font.headline": "bad/font",
        },
    };

    const result = processTheme(theme);
    assert.equal(result.cssVariables["--text-primary"], "#123456");
    assert.equal(result.cssVariables["--radius-button"], "8px");
    assert.equal(result.cssVariables["--font-title"], "'Inter'");
    assert.ok(!result.cssVariables["--text-secondary"]);
    assert.ok(!result.cssVariables["--radius-card"]);
    assert.ok(!result.cssVariables["--font-headline"]);
});

test("themeToDictionary preserves slot ordering and duplicates", async () => {
    const { themeToDictionary } = await loadEngine();
    const dict = themeToDictionary({
        slots: {
            slot_b: { hex: "#111111", ids: ["text.secondary"] },
            slot_a: { hex: "#111111", ids: ["text.primary"] },
        },
        borderRadius: { "radius.button": "6px" },
    });

    assert.equal(dict.colors.length, 2);
    assert.equal(dict.colors[0].hex, "#111111");
    assert.deepEqual([...dict.colors[0].ids], ["text.primary"]);
    assert.equal(dict.colors[1].hex, "#111111");
    assert.deepEqual([...dict.colors[1].ids], ["text.secondary"]);
    assert.equal(dict.borderRadius?.["radius.button"], "6px");
});

test("dictionaryToTheme drops invalid buckets and normalizes hex", async () => {
    const { dictionaryToTheme } = await loadEngine();
    const theme = dictionaryToTheme({
        colors: [
            { hex: "123456", ids: ["text.primary"] },
            { hex: "invalid", ids: ["text.secondary"] },
        ],
        borderRadius: {},
        fonts: {},
    });

    assert.deepEqual(Object.keys(theme.slots), ["slot_0"]);
    assert.equal(theme.slots.slot_0.hex, "#123456");
    assert.deepEqual(theme.slots.slot_0.ids, ["text.primary"]);
});

test("parseThemeResponse handles legacy dictionary and slot formats", async () => {
    const { parseThemeResponse } = await loadStylingHelpers();

    const legacy = parseThemeResponse(
        JSON.stringify({
            "#ffffff": ["text.primary"],
            "#000000": ["text.secondary"],
            borderRadius: { "radius.card": "10px" },
        }),
    );
    assert.equal(legacy.colors.length, 2);
    assert.equal(legacy.colors[0].hex, "#ffffff");
    assert.equal(legacy.colors[1].hex, "#000000");
    assert.equal(legacy.borderRadius?.["radius.card"], "10px");

    const slotBased = parseThemeResponse(
        JSON.stringify({
            slots: {
                slot_0: { hex: "#111111", ids: ["text.primary"] },
            },
        }),
    );
    assert.equal(slotBased.colors.length, 1);
    assert.equal(slotBased.colors[0].hex, "#111111");
});
