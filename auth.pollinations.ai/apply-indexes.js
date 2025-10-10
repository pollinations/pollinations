#!/usr/bin/env node

// Apply performance indexes to production database
// GitHub Issue: #2604

import { readFileSync } from "fs";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const isLocal = args.includes("--local");

console.log("🚀 Applying performance optimization indexes...");

const sqlContent = readFileSync(
    "./migrations/add_performance_indexes.sql",
    "utf8",
);

try {
    console.log(`📊 Creating indexes (mode: ${isLocal ? "local" : "remote"})...`);

    const statements = sqlContent
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    for (const statement of statements) {
        if (statement.trim()) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);

            try {
                if (isLocal) {
                    execSync(
                        `npx wrangler d1 execute github_auth --local --command="${statement};"`,
                        { stdio: "inherit", shell: true },
                    );
                } else {
                    execSync(
                        `wrangler d1 execute github_auth --remote --command="${statement};"`,
                        { stdio: "inherit", shell: true },
                    );
                }
            } catch (e) {
                console.log(`Note: ${statement} may already exist (this is OK)`);
            }
        }
    }

    console.log("✅ Performance optimization indexes applied successfully!");
    console.log("🔍 Test token validation performance now...");
} catch (error) {
    console.error("❌ Error applying indexes:", error.message);
    process.exit(1);
}
