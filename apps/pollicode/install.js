#!/usr/bin/env node
/**
 * Pollinations OpenCode Installer
 *
 * Cross-platform installer for OpenCode + oh-my-opencode pre-configured
 * with Pollinations AI models for optimal multi-agent workflows.
 *
 * Usage: npx @pollinations/opencode-installer
 *    or: node install.js
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { createInterface } from "readline";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

// Config directory based on OS
function getConfigDir() {
    const home = homedir();
    if (platform() === "win32") {
        return process.env.APPDATA
            ? join(process.env.APPDATA, "opencode")
            : join(home, ".config", "opencode");
    }
    return join(home, ".config", "opencode");
}

// OpenCode provider + models config
const OPENCODE_CONFIG = {
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["oh-my-opencode"],
    "model": "pollinations/claude-large", // Opus for main agent (Sisyphus)
    "small_model": "pollinations/gemini-fast",
    "provider": {
        "pollinations": {
            "npm": "@ai-sdk/openai-compatible",
            "name": "Pollinations AI (Free)",
            "options": {
                "baseURL": "https://gen.pollinations.ai/v1",
            },
            "models": {
                // Claude family
                "claude-large": {
                    "name": "Claude Opus 4.5 - Most Intelligent (Sisyphus)",
                },
                "claude": {
                    "name": "Claude Sonnet 4.5 - Balanced (Librarian)",
                },
                "claude-fast": { "name": "Claude Haiku 4.5 - Fast" },
                // OpenAI family
                "openai-large": {
                    "name": "GPT-5.2 - Strategic Reasoning (Oracle)",
                },
                "openai": { "name": "GPT-5 Mini - Balanced" },
                "openai-fast": { "name": "GPT-5 Nano - Ultra Fast" },
                // Gemini family
                "gemini-large": { "name": "Gemini 3 Pro - 1M Context" },
                "gemini": { "name": "Gemini 3 Flash - UI/UX Expert" },
                "gemini-fast": {
                    "name": "Gemini 2.5 Flash Lite - Exploration",
                },
                // Specialists
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

// oh-my-opencode agent mappings (following their recommended setup)
const OH_MY_OPENCODE_CONFIG = {
    "$schema":
        "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
    "agents": {
        // Main orchestrator - needs the most powerful model
        "Sisyphus": {
            "model": "pollinations/claude-large", // Opus 4.5 - like their default
        },
        // Strategic reasoning and architecture
        "oracle": {
            "model": "pollinations/openai-large", // GPT-5.2 for logical analysis
        },
        // Documentation and codebase research
        "librarian": {
            "model": "pollinations/claude", // Sonnet for deep understanding
        },
        // Fast codebase exploration
        "explore": {
            "model": "pollinations/gemini-fast", // Ultra fast for grep/search
        },
        // UI/UX development
        "frontend-ui-ux-engineer": {
            "model": "pollinations/gemini", // Gemini excels at creative UI
        },
        // Technical writing
        "document-writer": {
            "model": "pollinations/gemini-fast", // Fast prose generation
        },
        // Visual content analysis
        "multimodal-looker": {
            "model": "pollinations/gemini", // Gemini for vision tasks
        },
    },
};

function log(msg) {
    console.log(`\x1b[36m🌸 ${msg}\x1b[0m`);
}

function success(msg) {
    console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
}

function error(msg) {
    console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
}

function runCommand(cmd, options = {}) {
    try {
        return execSync(cmd, {
            encoding: "utf8",
            stdio: options.silent ? "pipe" : "inherit",
            ...options,
        });
    } catch {
        return null;
    }
}

async function checkOpenCode() {
    const result = runCommand("opencode --version", { silent: true });
    return result !== null;
}

async function installOpenCode() {
    log("Installing OpenCode CLI...");

    if (platform() === "win32") {
        // Windows: use PowerShell
        runCommand(
            'powershell -Command "irm https://opencode.ai/install.ps1 | iex"',
        );
    } else {
        // macOS/Linux: use curl
        runCommand("curl -fsSL https://opencode.ai/install | bash");
    }
}

async function installOhMyOpenCode() {
    log("Installing oh-my-opencode plugin...");

    // Use npx for cross-platform compatibility
    runCommand(
        "npx oh-my-opencode install --no-tui --claude=no --chatgpt=no --gemini=no",
    );
}

async function writeConfigs(apiKey) {
    const configDir = getConfigDir();

    // Ensure config directory exists
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    // Add API key if provided
    const opencodeConfig = { ...OPENCODE_CONFIG };
    if (apiKey) {
        opencodeConfig.provider.pollinations.options.apiKey = apiKey;
    }

    // Write opencode.json
    const opencodeConfigPath = join(configDir, "opencode.json");
    writeFileSync(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2));
    success(`Written: ${opencodeConfigPath}`);

    // Write oh-my-opencode.json
    const ohMyConfigPath = join(configDir, "oh-my-opencode.json");
    writeFileSync(
        ohMyConfigPath,
        JSON.stringify(OH_MY_OPENCODE_CONFIG, null, 2),
    );
    success(`Written: ${ohMyConfigPath}`);
}

async function main() {
    console.log(`
\x1b[35m╔═══════════════════════════════════════════════════════════╗
║     🌸 Pollinations OpenCode Installer 🌸                  ║
║                                                             ║
║  Pre-configured with high-performance models:               ║
║  • Sisyphus (main): Claude Opus 4.5                        ║
║  • Oracle: GPT-5.2 for strategic reasoning                 ║
║  • Librarian: Claude Sonnet for research                   ║
║  • Explore: Gemini Flash for fast search                   ║
║  • UI/UX: Gemini for creative frontend                     ║
╚═══════════════════════════════════════════════════════════╝\x1b[0m
`);

    // Step 1: Check/Install OpenCode
    log("Checking for OpenCode...");
    const hasOpenCode = await checkOpenCode();

    if (!hasOpenCode) {
        const install = await ask("OpenCode not found. Install it? (Y/n): ");
        if (install.toLowerCase() !== "n") {
            await installOpenCode();
        } else {
            error(
                "OpenCode is required. Please install from https://opencode.ai",
            );
            process.exit(1);
        }
    } else {
        success("OpenCode is installed");
    }

    // Step 2: Install oh-my-opencode
    log("Setting up oh-my-opencode plugin...");
    await installOhMyOpenCode();

    // Step 3: Ask for API key (required)
    console.log(`
\x1b[33mA Pollinations API key is required.
Get your free API key at: https://pollinations.ai/pricing\x1b[0m
`);

    let apiKey = await ask("Enter Pollinations API key: ");
    apiKey = apiKey.trim();

    if (!apiKey) {
        error(
            "API key is required. Get one at https://pollinations.ai/pricing",
        );
        rl.close();
        process.exit(1);
    }

    // Step 4: Write configs
    log("Writing configuration files...");
    await writeConfigs(apiKey);

    // Done!
    console.log(`
\x1b[32m╔═══════════════════════════════════════════════════════════╗
║                    🎉 Installation Complete! 🎉             ║
╚═══════════════════════════════════════════════════════════╝\x1b[0m

\x1b[36mQuick Start:\x1b[0m
  $ opencode

\x1b[36mUltrawork Mode (multi-agent):\x1b[0m
  Just include "ultrawork" or "ulw" in your prompt!
  
  Example: "ulw - refactor this codebase for better performance"

\x1b[36mAgent Commands:\x1b[0m
  @oracle   - Architecture & strategy (GPT-5.2)
  @librarian - Research & docs (Claude Sonnet)
  @explore  - Fast codebase search (Gemini Flash)

\x1b[35mPowered by Pollinations.ai - Free AI for Everyone 🌸\x1b[0m
`);

    rl.close();
}

main().catch((e) => {
    error(e.message);
    process.exit(1);
});
