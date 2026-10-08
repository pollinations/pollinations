// Unit tests for piConfig builders, models filtering, zip writer, and
// oauth helpers. Run: node --test test/*.test.js

import assert from "node:assert/strict";
import test from "node:test";
import { challengeFor, randomBase64Url, validateApiKey } from "../src/auth.js";
import { fetchAgentModels, filterAgentModels } from "../src/models.js";
import {
    BRIDGE_DUMMY_KEY,
    buildAuthJson,
    buildModelsJson,
    buildSettingsJson,
    GUEST,
    piRunArgs,
} from "../src/piConfig.js";
import { buildZip } from "../src/zip.js";

test("buildModelsJson: dummy key only, real key never enters guest config", () => {
    const models = [
        { id: "openai/gpt-5.4-nano", contextWindow: 128000, input: ["text"] },
        { id: "anthropic/claude-4", contextWindow: 200000, input: ["text"] },
    ];
    const config = buildModelsJson(models);
    const provider = config.providers.pollinations;
    assert.equal(provider.apiKey, BRIDGE_DUMMY_KEY);
    assert.equal(provider.apiKey, "bridge");
    assert.equal(provider.baseUrl, "https://gen.pollinations.ai/v1");
    assert.equal(provider.api, "openai-completions");
    assert.equal(provider.models.length, 2);
    assert.equal(provider.models[0].id, "openai/gpt-5.4-nano");
    assert.equal(provider.models[0].contextWindow, 128000);
    assert.ok(
        !JSON.stringify(config).includes("sk-"),
        "no real key material in guest config",
    );
});

test("buildAuthJson uses the dummy bridge key", () => {
    assert.deepEqual(buildAuthJson(), {
        pollinations: { type: "api_key", key: BRIDGE_DUMMY_KEY },
    });
});

test("buildSettingsJson defaults", () => {
    const s = buildSettingsJson();
    assert.equal(s.defaultProvider, "pollinations");
    assert.ok(s.defaultModel);
});

test("piRunArgs: extension, provider, model, mode, prompt", () => {
    const args = piRunArgs({
        model: "openai/gpt-5.4-nano",
        prompt: "hi",
        mode: "json",
        continueSession: false,
    });
    assert.ok(args.includes("--extension"));
    assert.equal(args[args.indexOf("--extension") + 1], GUEST.extensionPath);
    assert.ok(args.includes("--mode"));
    assert.equal(args[args.indexOf("--mode") + 1], "json");
    assert.ok(args.includes("-p"));
    const cont = piRunArgs({ model: "m", continueSession: true });
    assert.ok(cont.includes("--continue"));
});

const CATALOG = [
    {
        id: "openai/gpt-5.4-nano",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 128000,
        input_modalities: ["text"],
    },
    {
        id: "openai/gpt-realtime",
        tools: false,
        output_modalities: ["audio"],
        supported_endpoints: ["/v1/realtime"],
        context_length: 1000,
    },
    {
        id: "bad/image-model",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/images/generations"],
        context_length: 0,
    },
    {
        id: "google/gemini-2.5-flash",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 1000000,
        input_modalities: ["text", "image"],
        agent: false,
    },
    {
        id: "community/community-model",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 32000,
        community: true,
    },
];

test("filterAgentModels keeps only tool-capable chat models", () => {
    const got = filterAgentModels(CATALOG);
    const ids = got.map((m) => m.id);
    assert.deepEqual(ids, ["openai/gpt-5.4-nano", "google/gemini-2.5-flash"]);
    const nano = got.find((m) => m.id === "openai/gpt-5.4-nano");
    assert.equal(nano.contextWindow, 128000);
    assert.deepEqual(nano.input, ["text"]);
    const gemini = got.find((m) => m.id === "google/gemini-2.5-flash");
    assert.deepEqual(gemini.input, ["text", "image"]);
});

test("fetchAgentModels fetches and filters", async () => {
    const got = await fetchAgentModels(async () => ({
        ok: true,
        json: async () => ({ data: CATALOG }),
    }));
    assert.equal(got.length, 2);
});

test("fetchAgentModels throws on catalog failure", async () => {
    await assert.rejects(
        fetchAgentModels(async () => ({ ok: false, status: 500 })),
        /HTTP 500/,
    );
});

test("buildZip produces a Blob with valid stored entries", async () => {
    const entries = [
        { path: "hello.txt", bytes: new TextEncoder().encode("bridge works") },
        {
            path: "dir/nested.txt",
            bytes: new TextEncoder().encode("abc".repeat(500)),
        },
    ];
    const blob = buildZip(entries);
    assert.ok(blob instanceof Blob);
    const zip = Buffer.from(await blob.arrayBuffer());
    // local file header magic
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    // entry name present; method is stored (0)
    const idx = zip.indexOf(Buffer.from("hello.txt"));
    assert.ok(idx > 0);
    assert.equal(zip.readUInt16LE(idx - 30 + 8), 0);
    // payload follows immediately after the name
    const data = zip.subarray(
        idx + "hello.txt".length,
        idx + "hello.txt".length + 12,
    );
    assert.equal(data.toString(), "bridge works");
    // central directory + end record present at the tail
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test("zip of empty tree still has ECD", async () => {
    const zip = Buffer.from(await buildZip([]).arrayBuffer());
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test("validateApiKey accepts sk- keys and rejects junk", () => {
    const good = "sk-abcdef1234567890abcdef1234567890";
    assert.equal(validateApiKey(good), good);
    assert.equal(validateApiKey(`  ${good}  `), good);
    assert.equal(validateApiKey("password"), null);
    assert.equal(validateApiKey(""), null);
    assert.equal(validateApiKey("pk_live_abc"), null);
});

test("oauth: PKCE verifier/challenge pair", async () => {
    const verifier = randomBase64Url(32);
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
    const challenge = await challengeFor(verifier);
    assert.equal(challenge.length, 43); // base64url(sha256) of 32 bytes
    assert.notEqual(challenge, verifier);
});
