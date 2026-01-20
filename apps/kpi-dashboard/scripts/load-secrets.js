#!/usr/bin/env node
/**
 * Load secrets from SOPS-encrypted JSON and write to .env for Vite
 * Usage: node scripts/load-secrets.js
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const secretsPath = join(__dirname, "../secrets/env.json");
const envPath = join(__dirname, "../.env");

try {
    // Decrypt secrets using SOPS
    const decrypted = execSync(`sops decrypt ${secretsPath}`, {
        encoding: "utf-8",
    });
    const secrets = JSON.parse(decrypted);

    // Convert to VITE_ prefixed env vars
    const envContent = Object.entries(secrets)
        .map(([key, value]) => `VITE_${key}=${value}`)
        .join("\n");

    writeFileSync(envPath, envContent);
    console.log("✅ Secrets loaded to .env");
} catch (error) {
    console.error("❌ Failed to load secrets:", error.message);
    console.log("💡 Make sure SOPS is configured and secrets/env.json exists");
    process.exit(1);
}
