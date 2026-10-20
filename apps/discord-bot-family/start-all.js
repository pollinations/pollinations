#!/usr/bin/env node
const { spawn } = require("child_process");
const { join } = require("path");
const { config } = require("dotenv");

const dir = __dirname;
config({ path: join(dir, ".env") });

const TSX = join(dir, "node_modules/.bin/tsx");
const CLI = join(dir, "src-functional/cli.ts");
const GLOBAL_CHANNELS = "1370368057641533440,1123617013433110578"; // keep in sync with bots.json "channels"
const BOT_PLAYGROUND = "1123617013433110578";

const bots = [
    {
        model: "kimi",
        tokenEnv: "BOT_TOKEN_KIMI",
        channels: `1485374528564760858,${BOT_PLAYGROUND}`,
    },
    {
        model: "gemini-search",
        tokenEnv: "BOT_TOKEN_GEMINI_SEARCH",
        channels: `1485374325077971135,${BOT_PLAYGROUND}`,
    },
    {
        model: "perplexity-fast",
        tokenEnv: "BOT_TOKEN_PERPLEXITY_FAST",
        channels: `1485374426659684495,${BOT_PLAYGROUND}`,
    },
    {
        model: "deepseek",
        tokenEnv: "BOT_TOKEN_DEEPSEEK",
        channels: `1485374269973204992,${BOT_PLAYGROUND}`,
    },
    {
        model: "minimax",
        tokenEnv: "BOT_TOKEN_MINIMAX",
        channels: `1485376399211499643,${BOT_PLAYGROUND}`,
    },
];

for (const bot of bots) {
    const token = process.env[bot.tokenEnv];
    if (!token) {
        console.error(`SKIP ${bot.model}: no token (${bot.tokenEnv})`);
        continue;
    }
    const args = [
        CLI,
        bot.model,
        token,
        "--channels",
        bot.channels,
        "--global-channels",
        GLOBAL_CHANNELS,
    ];
    const child = spawn(TSX, args, {
        cwd: dir,
        env: { ...process.env, DEBUG: "app:*" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const tag = `[${bot.model}]`;
    child.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
    child.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
    child.on("exit", (code) =>
        console.error(`${tag} exited with code ${code}`),
    );
    console.log(`Started ${bot.model} (PID ${child.pid})`);
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
