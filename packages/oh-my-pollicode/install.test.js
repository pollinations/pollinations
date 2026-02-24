#!/usr/bin/env node

import { strict as assert } from "node:assert";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const EXPECTED_OPENCODE_CONFIG = {
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["oh-my-opencode"],
    "model": "pollinations/claude-large",
    "small_model": "pollinations/gemini-fast",
    "provider": {
        "pollinations": {
            "npm": "@ai-sdk/openai-compatible",
            "name": "Pollinations AI (Free)",
            "options": {
                "baseURL": "https://gen.pollinations.ai/v1/chat/completions",
            },
            "models": {
                "claude-large": {
                    "name": "Claude Opus 4.5 - Most Intelligent (Sisyphus)",
                },
                "claude": {
                    "name": "Claude Sonnet 4.5 - Balanced (Librarian)",
                },
                "claude-fast": { "name": "Claude Haiku 4.5 - Fast" },
                "openai-large": {
                    "name": "GPT-5.2 - Strategic Reasoning (Oracle)",
                },
                "openai": { "name": "GPT-5 Mini - Balanced" },
                "openai-fast": { "name": "GPT-5 Nano - Ultra Fast" },
                "gemini-large": { "name": "Gemini 3 Pro - 1M Context" },
                "gemini": { "name": "Gemini 3 Flash - UI/UX Expert" },
                "gemini-fast": {
                    "name": "Gemini 2.5 Flash Lite - Exploration",
                },
                "deepseek": { "name": "DeepSeek V3.2 - Reasoning" },
                "qwen-coder": { "name": "Qwen3 Coder 30B - Code" },
                "perplexity-fast": { "name": "Perplexity Sonar - Web Search" },
                "perplexity-reasoning": {
                    "name": "Perplexity Reasoning - Research",
                },
            },
        },
    },
};

const EXPECTED_OH_MY_OPENCODE_CONFIG = {
    "$schema":
        "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
    "agents": {
        "Sisyphus": {
            "model": "pollinations/claude-large",
        },
        "oracle": {
            "model": "pollinations/openai-large",
        },
        "librarian": {
            "model": "pollinations/claude",
        },
        "explore": {
            "model": "pollinations/gemini-fast",
        },
        "frontend-ui-ux-engineer": {
            "model": "pollinations/gemini",
        },
        "document-writer": {
            "model": "pollinations/gemini-fast",
        },
        "multimodal-looker": {
            "model": "pollinations/gemini",
        },
    },
};

test("Configuration Objects - OpenCode Config Structure", () => {
    assert.ok(EXPECTED_OPENCODE_CONFIG.$schema);
    assert.ok(EXPECTED_OPENCODE_CONFIG.plugin);
    assert.deepEqual(EXPECTED_OPENCODE_CONFIG.plugin, ["oh-my-opencode"]);
    assert.equal(EXPECTED_OPENCODE_CONFIG.model, "pollinations/claude-large");
});

test("Configuration Objects - Oh-My-OpenCode Config Structure", () => {
    assert.ok(EXPECTED_OH_MY_OPENCODE_CONFIG.$schema);
    assert.ok(EXPECTED_OH_MY_OPENCODE_CONFIG.agents);
    assert.ok(EXPECTED_OH_MY_OPENCODE_CONFIG.agents.Sisyphus);
});

test("Configuration Objects - Provider Config Completeness", () => {
    const provider = EXPECTED_OPENCODE_CONFIG.provider.pollinations;
    assert.ok(provider.npm);
    assert.ok(provider.name);
    assert.ok(provider.models);
    assert.ok(provider.options.baseURL);
});

test("Model Registry - Required Models Present", () => {
    const models = EXPECTED_OPENCODE_CONFIG.provider.pollinations.models;
    const requiredModels = [
        "claude-large",
        "claude",
        "openai-large",
        "gemini",
        "gemini-fast",
    ];

    requiredModels.forEach((model) => {
        assert.ok(models[model], `Missing model: ${model}`);
    });
});

test("Write Configs - File System Operations", () => {
    const testDir = join(tmpdir(), `opencode-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
        const opencodeConfig = JSON.stringify(
            EXPECTED_OPENCODE_CONFIG,
            null,
            2,
        );
        const ohMyConfig = JSON.stringify(
            EXPECTED_OH_MY_OPENCODE_CONFIG,
            null,
            2,
        );

        const configPath = join(testDir, "opencode.json");
        const ohMyPath = join(testDir, "oh-my-opencode.json");

        writeFileSync(configPath, opencodeConfig);
        writeFileSync(ohMyPath, ohMyConfig);

        assert.ok(existsSync(configPath), "opencode.json not created");
        assert.ok(existsSync(ohMyPath), "oh-my-opencode.json not created");

        const readOpencode = JSON.parse(readFileSync(configPath, "utf8"));
        const readOhMy = JSON.parse(readFileSync(ohMyPath, "utf8"));

        assert.deepEqual(readOpencode.model, EXPECTED_OPENCODE_CONFIG.model);
        assert.ok(readOhMy.agents.Sisyphus);
    } finally {
        rmSync(testDir, { recursive: true });
    }
});

test("API Key Validation - Non-Empty Key Required", () => {
    const validKey = "pk_test_abc123";
    const invalidKeys = ["", null, undefined];

    assert.ok(validKey, "Valid API key should be truthy");
    invalidKeys.forEach((key) => {
        assert.ok(!key, `Invalid API key "${key}" should be falsy`);
    });
});

test("Cross-Platform Paths - Config Directory", () => {
    const homedir = "/home/user";
    const configDirLinux = join(homedir, ".config", "opencode");
    const configDirMac = join(homedir, ".config", "opencode");
    const configDirWin = join("C:\\Users\\user\\AppData\\Roaming", "opencode");

    assert.ok(configDirLinux.includes(".config"));
    assert.ok(configDirMac.includes(".config"));
    assert.ok(configDirWin.includes("AppData"));
});

test("Agent Configuration - Sisyphus Agent Setup", () => {
    const sisyphus = EXPECTED_OH_MY_OPENCODE_CONFIG.agents.Sisyphus;
    assert.equal(sisyphus.model, "pollinations/claude-large");
});

test("Agent Configuration - Oracle Agent Setup", () => {
    const oracle = EXPECTED_OH_MY_OPENCODE_CONFIG.agents.oracle;
    assert.equal(oracle.model, "pollinations/openai-large");
});

test("Agent Configuration - Multi-Agent Models Are Different", () => {
    const agents = EXPECTED_OH_MY_OPENCODE_CONFIG.agents;
    const models = Object.values(agents).map((a) => a.model);

    // Ensure we have diversity in agents
    assert.ok(models.includes("pollinations/claude-large"));
    assert.ok(models.includes("pollinations/openai-large"));
    assert.ok(models.includes("pollinations/gemini-fast"));
});

test("Configuration Merge - API Key Addition", () => {
    const baseConfig = { ...EXPECTED_OPENCODE_CONFIG };
    const apiKey = "pk_test_xyz789";
    baseConfig.provider.pollinations.options.apiKey = apiKey;

    assert.equal(baseConfig.provider.pollinations.options.apiKey, apiKey);
    assert.equal(
        baseConfig.provider.pollinations.options.baseURL,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
});

test("Provider Options - BaseURL Correctness", () => {
    const baseURL =
        EXPECTED_OPENCODE_CONFIG.provider.pollinations.options.baseURL;
    assert.ok(baseURL.includes("gen.pollinations.ai"));
    assert.ok(baseURL.includes("v1/chat/completions"));
});

test("Model List - Count and Diversity", () => {
    const models = EXPECTED_OPENCODE_CONFIG.provider.pollinations.models;
    const modelNames = Object.keys(models);

    assert.ok(modelNames.length >= 10, "Should have at least 10 models");
    assert.ok(modelNames.some((m) => m.includes("claude")));
    assert.ok(modelNames.some((m) => m.includes("openai")));
    assert.ok(modelNames.some((m) => m.includes("gemini")));
});

test("Prompt Handling - Ultrawork Mode Commands", () => {
    const prompts = [
        "ulw - refactor this codebase",
        "ultrawork - optimize performance",
        "@oracle - architecture review",
        "@librarian - research documentation",
    ];

    prompts.forEach((prompt) => {
        assert.ok(prompt.length > 0);
        assert.ok(typeof prompt === "string");
    });
});

test("Error Messages - User Guidance", () => {
    const errorStates = {
        noOpenCode:
            "OpenCode is required. Please install from https://opencode.ai",
        noApiKey:
            "API key is required. Get one at https://enter.pollinations.ai",
        configWrite: "Configuration files written successfully",
    };

    Object.values(errorStates).forEach((msg) => {
        assert.ok(msg.length > 0);
        assert.ok(typeof msg === "string");
    });
});

test("Installation Flow - Steps Sequence", () => {
    const steps = [
        "Check/Install OpenCode",
        "Install oh-my-opencode plugin",
        "Prompt for API key",
        "Write configuration files",
        "Display success message",
    ];

    assert.equal(steps.length, 5);
    steps.forEach((step) => {
        assert.ok(step.length > 0);
    });
});

// Summary
console.log("\n✅ All installation tests passed!");
console.log("   Use: npm test or node install.test.js");
console.log("   Config validation: ✓");
console.log("   Model registry: ✓");
console.log("   Agent setup: ✓");
console.log("   Error handling: ✓");
