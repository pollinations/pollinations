import assert from "node:assert/strict";
import test from "node:test";
import {
    BRIDGE_PLACEHOLDER_KEY,
    buildAuthJson,
    buildModelsJson,
    buildPiArgs,
    buildSettingsJson,
    parsePiEvents,
} from "../src/piConfig.js";

test("models.json keeps the key out of the guest", () => {
    const config = buildModelsJson([{ id: "openai/gpt-5.4-nano" }]);
    const provider = config.providers.pollinations;
    assert.equal(provider.baseUrl, "https://gen.pollinations.ai/v1");
    assert.equal(provider.api, "openai-completions");
    assert.equal(provider.models[0].id, "openai/gpt-5.4-nano");
    assert.equal(JSON.stringify(config).includes("sk_"), false);
});

test("auth.json carries only the bridge placeholder", () => {
    assert.equal(buildAuthJson().pollinations.key, BRIDGE_PLACEHOLDER_KEY);
});

test("settings.json selects the pollinations provider", () => {
    const settings = buildSettingsJson("openai/gpt-5.4-nano");
    assert.equal(settings.defaultProvider, "pollinations");
    assert.equal(settings.defaultModel, "openai/gpt-5.4-nano");
});

test("pi is started with the extension, provider and json mode", () => {
    const args = buildPiArgs({ prompt: "hi", model: "openai/gpt-5.4-nano" });
    assert.deepEqual(args, [
        "--extension",
        "/workspace/.bridge/bridge.mjs",
        "--provider",
        "pollinations",
        "--model",
        "openai/gpt-5.4-nano",
        "--mode",
        "json",
        "-p",
        "hi",
    ]);
});

test("parsePiEvents keeps json lines and ignores noise", () => {
    const events = parsePiEvents('noise\n{"type":"agent_settled"}\nnot json\n{"type":"x"}');
    assert.deepEqual(
        events.map((event) => event.type),
        ["agent_settled", "x"],
    );
});
