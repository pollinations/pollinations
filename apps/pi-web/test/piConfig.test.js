import assert from "node:assert/strict";
import test from "node:test";
import {
    buildAuthJson,
    buildModelsJson,
    buildSessionJson,
    buildSettingsJson,
    DEFAULT_MODEL,
    piRunArgs,
} from "../src/piConfig.js";

test("models.json matches the polli-cli provider schema", () => {
    const cfg = buildModelsJson(["openai/gpt-5.4-nano"]);
    const provider = cfg.providers.pollinations;
    assert.equal(provider.baseUrl, "https://gen.pollinations.ai/v1");
    assert.equal(provider.api, "openai-completions");
    assert.equal(provider.apiKey, "bridge"); // dummy credential, never a real key
    assert.deepEqual(provider.compat, {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
        supportsStrictMode: false,
        maxTokensField: "max_tokens",
    });
    assert.equal(provider.models[0].id, "openai/gpt-5.4-nano");
    assert.deepEqual(provider.models[0].input, ["text"]);
});

test("auth.json holds only the bridge placeholder", () => {
    assert.deepEqual(buildAuthJson(), {
        pollinations: { type: "api_key", key: "bridge" },
    });
});

test("settings.json pins provider and default model", () => {
    assert.deepEqual(buildSettingsJson(), {
        defaultProvider: "pollinations",
        defaultModel: DEFAULT_MODEL,
    });
});

test("session.json carries admission pair", () => {
    assert.deepEqual(buildSessionJson({ runId: "r", keyGen: 3 }), {
        runId: "r",
        keyGen: 3,
    });
});

test("run args use extension + print/JSON mode", () => {
    const args = piRunArgs({ model: "m1", prompt: "hi" });
    const joined = args.join(" ");
    assert.match(joined, /--extension \/workspace\/\.bridge\/bridge\.mjs/);
    assert.match(joined, /--provider pollinations/);
    assert.match(joined, /--model m1/);
    assert.match(joined, /--mode json/);
    assert.ok(!joined.includes("--continue"));
    assert.deepEqual(args.at(-2), "-p");
    assert.deepEqual(args.at(-1), "hi");
});

test("run args add --continue for follow-up runs", () => {
    assert.ok(
        piRunArgs({ model: "m", prompt: "p", continueSession: true }).includes(
            "--continue",
        ),
    );
});
