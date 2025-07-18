#!/usr/bin/env node
/**
 * Test Setup Script for Vectorize Image Caching
 * Verifies that the implementation is ready for testing
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

console.log("🔍 Testing Vectorize Image Caching Setup...\n");

let hasErrors = false;

// Helper function to check if a command exists
function commandExists(command) {
    try {
        execSync(`which ${command}`, { stdio: "ignore" });
        return true;
    } catch (error) {
        return false;
    }
}

// Helper function to run command and get output
function runCommand(command, silent = false) {
    try {
        const output = execSync(command, {
            encoding: "utf8",
            stdio: silent ? "ignore" : "pipe",
        });
        return { success: true, output };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Test 1: Check if wrangler is installed and correct version
console.log("📋 1. Checking Wrangler CLI...");
if (!commandExists("wrangler")) {
    console.log(
        "   ❌ Wrangler CLI not found. Install with: npm install -g wrangler",
    );
    hasErrors = true;
} else {
    const wranglerVersion = runCommand("wrangler --version");
    if (wranglerVersion.success) {
        console.log(
            `   ✅ Wrangler installed: ${wranglerVersion.output.trim()}`,
        );

        // Check if version is >= 3.71.0 (required for Vectorize V2)
        const versionMatch =
            wranglerVersion.output.match(/(\d+)\.(\d+)\.(\d+)/);
        if (versionMatch) {
            const [, major, minor, patch] = versionMatch.map(Number);
            if (major > 3 || (major === 3 && minor >= 71)) {
                console.log("   ✅ Version supports Vectorize V2");
            } else {
                console.log(
                    "   ⚠️  Version may not support Vectorize V2 (requires ≥3.71.0)",
                );
            }
        }
    } else {
        console.log("   ❌ Could not get Wrangler version");
        hasErrors = true;
    }
}

// Test 2: Check wrangler.toml configuration
console.log("\n📋 2. Checking wrangler.toml configuration...");
const wranglerConfigPath = path.join(process.cwd(), "wrangler.toml");

if (!fs.existsSync(wranglerConfigPath)) {
    console.log("   ❌ wrangler.toml not found");
    hasErrors = true;
} else {
    const wranglerConfig = fs.readFileSync(wranglerConfigPath, "utf8");

    // Check for required bindings
    const checks = [
        { name: "Vectorize binding", pattern: /\[\[vectorize\]\]/ },
        { name: "AI binding", pattern: /\[ai\]/ },
        { name: "R2 bucket binding", pattern: /\[\[r2_buckets\]\]/ },
        {
            name: "Vectorize index name",
            pattern: /index_name\s*=\s*["']pollinations-image-cache["']/,
        },
        { name: "AI binding name", pattern: /binding\s*=\s*["']AI["']/ },
    ];

    checks.forEach((check) => {
        if (check.pattern.test(wranglerConfig)) {
            console.log(`   ✅ ${check.name} configured`);
        } else {
            console.log(`   ❌ ${check.name} missing`);
            hasErrors = true;
        }
    });
}

// Test 3: Check required source files
console.log("\n📋 3. Checking implementation files...");
const requiredFiles = [
    "src/index.js",
    "src/semantic-cache.js",
    "src/embedding-service.js",
    "src/hybrid-cache.js",
    "src/cache-utils.js",
    "src/image-proxy.js",
    "src/analytics.js",
];

requiredFiles.forEach((file) => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file} exists`);
    } else {
        console.log(`   ❌ ${file} missing`);
        hasErrors = true;
    }
});

// Test 4: Check integration in index.js
console.log("\n📋 4. Checking semantic cache integration...");
const indexPath = path.join(process.cwd(), "src/index.js");
if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, "utf8");

    const integrationChecks = [
        { name: "Semantic cache import", pattern: /import.*semantic-cache/ },
        { name: "Semantic cache creation", pattern: /createSemanticCache/ },
        {
            name: "Semantic cache check",
            pattern: /checkSemanticCacheAndRespond/,
        },
        { name: "Async embedding storage", pattern: /cacheImageEmbedding/ },
        { name: "Exact cache check", pattern: /checkExactCacheAndRespond/ },
    ];

    integrationChecks.forEach((check) => {
        if (check.pattern.test(indexContent)) {
            console.log(`   ✅ ${check.name} integrated`);
        } else {
            console.log(`   ❌ ${check.name} missing`);
            hasErrors = true;
        }
    });
} else {
    console.log("   ❌ Cannot check integration - src/index.js missing");
    hasErrors = true;
}

// Test 5: Check if authenticated with Cloudflare
console.log("\n📋 5. Checking Cloudflare authentication...");
const authCheck = runCommand("wrangler whoami", true);
if (authCheck.success) {
    console.log("   ✅ Authenticated with Cloudflare");
} else {
    console.log("   ❌ Not authenticated with Cloudflare");
    console.log("      Run: wrangler login");
    hasErrors = true;
}

// Summary
console.log("\n📊 Setup Summary:");
if (hasErrors) {
    console.log(
        "❌ Setup incomplete - please fix the issues above before testing",
    );
    console.log("\n🚦 Next steps:");
    console.log("   1. Fix any missing requirements above");
    console.log("   2. Run setup commands from setup-vectorize.js");
    console.log("   3. Test with: wrangler dev --env test");
    console.log("   4. Run test suite: node test-live-vectorize.js");
    process.exit(1);
} else {
    console.log("✅ Setup looks good! Ready for testing");
    console.log("\n🚦 Next steps:");
    console.log("   1. Create Vectorize indexes: node setup-vectorize.js");
    console.log("   2. Start local dev: wrangler dev --env test");
    console.log("   3. Run tests: node test-live-vectorize.js");
    console.log("   4. Check logs for semantic cache activity");
}
