#!/usr/bin/env node
/**
 * Deploy Webhook Server
 *
 * A simple HTTP server that triggers deployments when called with a valid token.
 * Protected by Cloudflare Access - only requests with valid CF service token headers get through.
 *
 * Usage:
 *   DEPLOY_TOKEN=xxx node deploy-webhook.js
 *
 * Or as systemd service (see setup-services.sh)
 */

const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");

const PORT = process.env.DEPLOY_WEBHOOK_PORT || 8787;
const REPO_PATH = process.env.REPO_PATH || "/home/ubuntu/pollinations";

// Token can be from env or file
const DEPLOY_TOKEN =
    process.env.DEPLOY_TOKEN ||
    (fs.existsSync("/home/ubuntu/.deploy-token")
        ? fs.readFileSync("/home/ubuntu/.deploy-token", "utf8").trim()
        : null);

if (!DEPLOY_TOKEN) {
    console.error(
        "ERROR: DEPLOY_TOKEN not set. Set via env or /home/ubuntu/.deploy-token",
    );
    process.exit(1);
}

const deploy = () =>
    new Promise((resolve, reject) => {
        const script = `
    set -e
    cd ${REPO_PATH}
    git fetch origin
    git reset --hard origin/production
    
    # Secure .env permissions
    chmod 600 ${REPO_PATH}/text.pollinations.ai/.env 2>/dev/null || true
    chmod 600 ${REPO_PATH}/image.pollinations.ai/.env 2>/dev/null || true
    
    # Install dependencies
    cd ${REPO_PATH}/text.pollinations.ai && pnpm install --frozen-lockfile
    cd ${REPO_PATH}/image.pollinations.ai && pnpm install --frozen-lockfile
    
    # Restart services
    sudo systemctl restart text-pollinations.service image-pollinations.service
    
    echo "Deploy complete at $(date)"
  `;

        exec(
            script,
            {
                maxBuffer: 10 * 1024 * 1024,
                shell: "/bin/bash",
            },
            (err, stdout, stderr) => {
                if (err) reject({ err, stdout, stderr });
                else resolve({ stdout, stderr });
            },
        );
    });

const server = http.createServer(async (req, res) => {
    const timestamp = new Date().toISOString();

    // Health check (no auth required - useful for monitoring)
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("OK");
    }

    // Only accept POST to root or /deploy
    if (req.method !== "POST" || (req.url !== "/" && req.url !== "/deploy")) {
        res.writeHead(404);
        return res.end("Not Found");
    }

    // Check authorization
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${DEPLOY_TOKEN}`) {
        console.log(
            `[${timestamp}] Unauthorized deploy attempt from ${req.socket.remoteAddress}`,
        );
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    console.log(
        `[${timestamp}] Deploy triggered from ${req.socket.remoteAddress}`,
    );

    try {
        const result = await deploy();
        console.log(`[${timestamp}] Deploy succeeded`);
        console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                success: true,
                timestamp,
                output: result.stdout.slice(-1000), // Last 1000 chars
            }),
        );
    } catch (e) {
        console.error(
            `[${timestamp}] Deploy failed:`,
            e.stderr || e.err?.message,
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                success: false,
                timestamp,
                error: e.stderr || e.err?.message || "Unknown error",
            }),
        );
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Deploy webhook listening on 127.0.0.1:${PORT}`);
    console.log(`Repository: ${REPO_PATH}`);
});
