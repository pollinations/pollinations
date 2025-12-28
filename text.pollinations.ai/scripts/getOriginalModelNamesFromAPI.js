#!/usr/bin/env node

/**
 * 🔍 MODEL ORIGINAL NAME DISCOVERY SCRIPT
 * =====================================
 *
 * Discovers actual model names returned by API providers for accurate cost calculation.
 *
 * 🚀 USAGE:
 * node scripts/getOriginalModelNamesFromAPI.js           # Test all models
 * node scripts/getOriginalModelNamesFromAPI.js openai   # Test single model
 * node scripts/getOriginalModelNamesFromAPI.js --help   # Show help
 *
 * 📋 EXAMPLES:
 * node scripts/getOriginalModelNamesFromAPI.js openai
 * node scripts/getOriginalModelNamesFromAPI.js mistral
 * node scripts/getOriginalModelNamesFromAPI.js unity
 *
 * ⚙️ PREREQUISITES:
 * • Start local server: DEBUG=* npm start (port 16385)
 * • Ensure availableModels.js exists
 *
 */

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const execAsync = promisify(exec);

const AVAILABLE_MODELS_PATH = "./availableModels.js";
const AUTH_TOKEN = process.env.POLLINATIONS_AI_TOKEN;
const API_BASE = "http://localhost:16385";
const API_ENDPOINT = "http://localhost:16385/openai";

// Check if AUTH_TOKEN is available
if (!AUTH_TOKEN) {
    console.error(
        "❌ ERROR: POLLINATIONS_AI_TOKEN environment variable is not set!",
    );
    console.error("💡 Please set POLLINATIONS_AI_TOKEN in your .env file");
    process.exit(1);
}

console.log("🌍 Mode: LOCAL DEVELOPMENT ONLY");
console.log(`📡 API Base: ${API_BASE}`);
console.log(`📁 Models file: ${AVAILABLE_MODELS_PATH}`);
console.log("💡 Make sure your local server is running on port 16385");
console.log("💡 Start your server with: DEBUG=* npm start");

// Load models from local availableModels.js file
async function loadLocalModels() {
    try {
        console.log("📁 Loading models from local availableModels.js...");

        // Import the availableModels directly
        const { availableModels } = await import("../availableModels.js");

        console.log(
            `✅ Loaded ${availableModels.length} models from local file`,
        );

        return availableModels.map((model) => ({
            name: model.name,
            aliases: model.aliases,
            description: model.description,
            provider: model.provider,
            tier: model.tier,
            input_modalities: model.input_modalities,
            output_modalities: model.output_modalities,
            audio: model.audio,
        }));
    } catch (error) {
        console.error("❌ Error loading local models:", error);
        console.error(
            "Make sure availableModels.js exists and is properly formatted",
        );
        return [];
    }
}

// Check if local server is running
async function checkLocalServer() {
    try {
        const curlCommand = `curl -s --max-time 30 --connect-timeout 30 ${API_BASE}/models`;
        const { stdout, stderr } = await execAsync(curlCommand);
        return !stderr && stdout.trim() !== "";
    } catch (error) {
        return false;
    }
}

// Get available models from local file
async function getAvailableModels() {
    // Check if local server is running
    const serverRunning = await checkLocalServer();
    if (!serverRunning) {
        console.log("⚠️  Local server not running on port 16385");
        console.log(
            "💡 Loading models from local file only (no API testing will be performed)",
        );
    }
    return await loadLocalModels();
}

async function testModelForOriginalName(modelName, modelMetadata = null) {
    try {
        console.log(`🧪 Testing: ${modelName}`);
        const startTime = Date.now();

        // Detect if this is an audio model that needs special handling
        // Use model metadata if available, otherwise fallback to name-based detection
        let isAudioModel = false;
        if (modelMetadata && modelMetadata.output_modalities) {
            isAudioModel = modelMetadata.output_modalities.includes("audio");
        } else {
            // Fallback to name-based detection
            isAudioModel =
                modelName.includes("audio") || modelName.includes("hypnosis");
        }

        let requestPayload;
        if (isAudioModel) {
            // For audio models, include modalities and audio output specification
            requestPayload = {
                model: modelName,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 3,
                modalities: ["text", "audio"],
                audio: {
                    voice: "alloy",
                    format: "wav",
                },
            };
            console.log(`  🎧 Audio model detected - adding audio modalities`);
        } else {
            // Standard text-only request
            requestPayload = {
                model: modelName,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 3,
            };
        }

        // Use 30 second timeout for all models
        const maxTime = 30;
        const connectTimeout = 30;

        // Use -s to suppress progress, --show-error to still show real errors
        const curlCommand = `curl -s --show-error --max-time ${maxTime} --connect-timeout ${connectTimeout} -X POST ${API_ENDPOINT} \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer ${AUTH_TOKEN}" \\
            -d '${JSON.stringify(requestPayload).replace(/'/g, "'\"'\"'")}'`;

        console.log(
            `  🔧 Debug - Curl command: ${curlCommand.replace(AUTH_TOKEN, AUTH_TOKEN.substring(0, 8) + "...")}`,
        );

        const { stdout, stderr } = await execAsync(curlCommand);
        const duration = Date.now() - startTime;

        if (stderr) {
            const errorMsg = stderr.trim();
            console.log(
                `  ❌ Error (${duration}ms): ${errorMsg.substring(0, 100)}`,
            );

            // Categorize error types
            let errorType = "unknown";
            if (
                errorMsg.includes("timeout") ||
                errorMsg.includes("timed out")
            ) {
                errorType = "timeout";
            } else if (
                errorMsg.includes("Connection refused") ||
                errorMsg.includes("connect")
            ) {
                errorType = "connection";
            } else if (errorMsg.includes("HTTP")) {
                errorType = "http";
            }

            return {
                modelName,
                originalName: null,
                error: errorMsg,
                errorType,
                duration,
                success: false,
            };
        }

        // Check if response is empty
        if (!stdout || stdout.trim() === "") {
            console.log(`  ❌ Empty response (${duration}ms)`);
            return {
                modelName,
                originalName: null,
                error: "Empty response from API",
                errorType: "empty_response",
                duration,
                success: false,
            };
        }

        try {
            console.log(`  🔍 Debug - Raw response: ${stdout}`);
            const response = JSON.parse(stdout);

            if (response.error) {
                console.log(
                    `  ❌ API Error (${duration}ms): ${JSON.stringify(response.error)}`,
                );
                return {
                    modelName,
                    originalName: null,
                    error: response.error,
                    errorType: "api_error",
                    duration,
                    success: false,
                };
            }

            const originalName = response.model;
            const userTier = response.user_tier || "unknown";

            if (originalName && originalName !== modelName) {
                console.log(
                    `  ✅ ${modelName} → ${originalName} (DIFFERENT) | User Tier: ${userTier} (${duration}ms)`,
                );
            } else {
                console.log(
                    `  ✅ ${modelName} → ${originalName || modelName} (SAME) | User Tier: ${userTier} (${duration}ms)`,
                );
            }

            return {
                modelName,
                originalName,
                userTier,
                duration,
                success: true,
            };
        } catch (parseError) {
            console.log(
                `  ❌ Parse error (${duration}ms): ${parseError.message}`,
            );
            console.log(`  📝 Raw response: ${stdout.substring(0, 200)}...`);
            return {
                modelName,
                originalName: null,
                error: `Parse error: ${parseError.message}`,
                errorType: "parse_error",
                rawResponse: stdout.substring(0, 500),
                duration,
                success: false,
            };
        }
    } catch (error) {
        console.log(`  ❌ Request error: ${error.message}`);
        return {
            modelName,
            originalName: null,
            error: error.message,
            errorType: "request_error",
            success: false,
        };
    }
}

async function updateAvailableModelsFile(results) {
    try {
        console.log(
            "\n📝 Updating availableModels.js with discovered original names...",
        );

        const filePath = path.resolve(process.cwd(), AVAILABLE_MODELS_PATH);
        let content = await fs.readFile(filePath, "utf8");

        let updateCount = 0;

        // Update each successful result that has a different original name
        for (const result of results) {
            if (
                result.success &&
                result.originalName &&
                result.originalName !== result.modelName
            ) {
                // Pattern to find the model and update its original_name
                const modelPattern = new RegExp(
                    `(name:\\s*"${result.modelName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}",[^}]*?original_name:\\s*)null[^,]*`,
                    "g",
                );

                const replacement = `$1"${result.originalName}"`;
                const newContent = content.replace(modelPattern, replacement);

                if (newContent !== content) {
                    content = newContent;
                    updateCount++;
                    console.log(
                        `  ✅ Updated ${result.modelName} → ${result.originalName}`,
                    );
                } else {
                    console.log(
                        `  ⚠️  Could not update ${result.modelName} (pattern not found)`,
                    );
                }
            }
        }

        if (updateCount > 0) {
            await fs.writeFile(filePath, content, "utf8");
            console.log(
                `\n💾 Successfully updated ${updateCount} models in availableModels.js`,
            );
        } else {
            console.log("\nℹ️  No updates needed in availableModels.js");
        }

        return updateCount;
    } catch (error) {
        console.error("❌ Error updating availableModels.js:", error);
        return 0;
    }
}

async function discoverAllOriginalNames() {
    console.log("🚀 Starting comprehensive model discovery...");
    console.log(`📡 Target API: ${API_BASE}`);
    console.log(`🔑 Using auth token: ${AUTH_TOKEN.substring(0, 8)}...`);

    // Check if we can test against the local API
    const canTestAPI = await checkLocalServer();
    if (!canTestAPI) {
        console.log("📝 Local server not running, will show error");
    }

    // Get models from local file
    const apiModels = await getAvailableModels();

    if (apiModels.length === 0) {
        console.log("❌ No models found!");
        return;
    }

    // If server not running, show error and exit
    if (!canTestAPI) {
        console.log("\n" + "=".repeat(80));
        console.log("❌ LOCAL SERVER NOT RUNNING");
        console.log("=".repeat(80));

        console.log(
            "\n🚀 To run this script, you need to start your local development server first.",
        );
        console.log("\n📝 Steps to start local environment:");
        console.log("   1. Open a new terminal");
        console.log("   2. Navigate to the text.pollinations.ai directory");
        console.log("   3. Run: DEBUG=* npm start");
        console.log("   4. Wait for server to start on http://localhost:16385");
        console.log(
            "   5. Then run this script again: node scripts/getOriginalModelNamesFromAPI.js",
        );

        console.log("\n❌ Exiting: Local server required for model testing.");
        process.exit(1);
    }

    const modelNames = apiModels.map((m) => m.name);
    console.log(`\n📋 Models to test: ${modelNames.join(", ")}`);

    // Create a metadata map for efficient lookup
    const modelMetadataMap = new Map();
    apiModels.forEach((model) => {
        modelMetadataMap.set(model.name, model);
    });

    console.log("\n" + "=".repeat(80));
    console.log("TESTING ALL MODELS");
    console.log("=".repeat(80));

    const results = [];
    const batchSize = 2; // Small batches to be gentle on the server

    for (let i = 0; i < modelNames.length; i += batchSize) {
        const batch = modelNames.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(modelNames.length / batchSize);

        console.log(`\n📦 Batch ${batchNum}/${totalBatches}:`);

        // Test models sequentially within the batch to avoid overwhelming
        for (const modelName of batch) {
            const modelMetadata = modelMetadataMap.get(modelName);
            const result = await testModelForOriginalName(
                modelName,
                modelMetadata,
            );
            results.push(result);

            // Small delay between individual tests
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Wait between batches
        if (i + batchSize < modelNames.length) {
            console.log("⏳ Waiting 3 seconds before next batch...");
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    // Generate comprehensive report
    console.log("\n" + "=".repeat(80));
    console.log("DISCOVERY RESULTS");
    console.log("=".repeat(80));

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const different = successful.filter(
        (r) => r.originalName && r.originalName !== r.modelName,
    );
    const same = successful.filter(
        (r) => !r.originalName || r.originalName === r.modelName,
    );

    console.log(`\n📊 SUMMARY:`);
    console.log(`  Total models tested: ${results.length}`);
    console.log(`  ✅ Successful: ${successful.length}`);
    console.log(`  ❌ Failed: ${failed.length}`);
    console.log(`  🔄 Different names: ${different.length}`);
    console.log(`  ✅ Same names: ${same.length}`);

    if (different.length > 0) {
        console.log(`\n🔄 MODELS WITH DIFFERENT ORIGINAL NAMES:`);
        console.log("-".repeat(80));
        different.forEach((result) => {
            const tierInfo = result.userTier
                ? ` | Tier: ${result.userTier}`
                : "";
            console.log(
                `  ${result.modelName.padEnd(25)} → ${result.originalName}${tierInfo}`,
            );
        });
    }

    if (same.length > 0) {
        console.log(`\n✅ MODELS WITH SAME NAMES:`);
        console.log("-".repeat(80));
        same.forEach((result) => {
            const tierInfo = result.userTier
                ? ` | Tier: ${result.userTier}`
                : "";
            console.log(`  ${result.modelName}${tierInfo}`);
        });
    }

    if (failed.length > 0) {
        console.log(`\n❌ FAILED MODELS - COMPREHENSIVE ERROR REPORT:`);
        console.log("=".repeat(80));

        // Group failures by error type
        const errorsByType = {};
        failed.forEach((result) => {
            const errorType = result.errorType || "unknown";
            if (!errorsByType[errorType]) {
                errorsByType[errorType] = [];
            }
            errorsByType[errorType].push(result);
        });

        // Report by error type
        Object.entries(errorsByType).forEach(([errorType, failures]) => {
            console.log(
                `\n🏷️  ${errorType.toUpperCase()} ERRORS (${failures.length} models):`,
            );
            console.log("-".repeat(60));

            failures.forEach((result) => {
                const duration = result.duration
                    ? `(${result.duration}ms)`
                    : "";
                const errorMsg =
                    typeof result.error === "string"
                        ? result.error
                        : JSON.stringify(result.error);

                console.log(`  📍 ${result.modelName}`);
                console.log(`     ⏱️  Duration: ${duration || "N/A"}`);
                console.log(`     ❌ Error: ${errorMsg}`);

                // Show raw response for parse errors
                if (result.rawResponse) {
                    console.log(
                        `     📝 Raw Response: ${result.rawResponse.substring(0, 150)}...`,
                    );
                }
                console.log("");
            });
        });

        // Summary of error types
        console.log(`\n📈 ERROR TYPE SUMMARY:`);
        console.log("-".repeat(40));
        Object.entries(errorsByType).forEach(([errorType, failures]) => {
            console.log(`  ${errorType.padEnd(15)}: ${failures.length} models`);
        });

        // List all failed model names for easy copy-paste
        console.log(`\n📋 FAILED MODEL NAMES (for retesting):`);
        console.log("-".repeat(40));
        console.log(failed.map((r) => r.modelName).join(", "));
    }

    // Show API vs Local comparison
    console.log(`\n🔍 API vs LOCAL COMPARISON:`);
    console.log("-".repeat(80));
    for (const apiModel of apiModels) {
        const result = results.find((r) => r.modelName === apiModel.name);
        const status = result?.success ? "✅" : "❌";
        const originalName = result?.originalName || "N/A";
        const aliases = apiModel.aliases || "N/A";

        console.log(
            `  ${status} ${apiModel.name.padEnd(20)} | API alias: ${aliases.padEnd(30)} | Actual: ${originalName}`,
        );
    }

    // Update the file
    const updateCount = await updateAvailableModelsFile(results);

    console.log("\n" + "=".repeat(80));
    console.log("✨ DISCOVERY COMPLETE!");
    console.log("=".repeat(80));
    console.log(
        `📈 Successfully discovered ${different.length} different model names`,
    );
    console.log(`📝 Updated ${updateCount} models in availableModels.js`);
    console.log(
        `🎯 API provided ${apiModels.length} models, tested ${results.length}`,
    );

    return results;
}

// Function to test a single model
async function testSingleModel(modelName) {
    console.log(`🎯 Testing single model: ${modelName}`);
    console.log(`📡 Target API: ${API_BASE}`);
    console.log(`🔑 Using auth token: ${AUTH_TOKEN.substring(0, 8)}...`);

    // Check if we can test against the local API
    const canTestAPI = await checkLocalServer();
    if (!canTestAPI) {
        console.log("\n" + "=".repeat(80));
        console.log("❌ LOCAL SERVER NOT RUNNING");
        console.log("=".repeat(80));

        console.log(
            "\n🚀 To run this script, you need to start your local development server first.",
        );
        console.log("\n📝 Steps to start local environment:");
        console.log("   1. Open a new terminal");
        console.log("   2. Navigate to the text.pollinations.ai directory");
        console.log("   3. Run: DEBUG=* npm start");
        console.log("   4. Wait for server to start on http://localhost:16385");
        console.log("   5. Then run this script again");

        console.log("\n❌ Exiting: Local server required for model testing.");
        process.exit(1);
    }

    // Get models from local file
    const apiModels = await getAvailableModels();

    if (apiModels.length === 0) {
        console.log("❌ No models found!");
        return;
    }

    // Find the specific model
    const targetModel = apiModels.find((m) => m.name === modelName);
    if (!targetModel) {
        console.log(`❌ Model '${modelName}' not found!`);
        console.log(
            `\n📋 Available models: ${apiModels.map((m) => m.name).join(", ")}`,
        );
        process.exit(1);
    }

    console.log(`\n✅ Found model: ${targetModel.name}`);
    console.log(`📝 Description: ${targetModel.description}`);
    console.log(`🏭 Provider: ${targetModel.provider}`);

    console.log("\n" + "=".repeat(80));
    console.log(`TESTING MODEL: ${modelName.toUpperCase()}`);
    console.log("=".repeat(80));

    // Test the model
    const result = await testModelForOriginalName(modelName, targetModel);

    // Display results
    console.log("\n" + "=".repeat(80));
    console.log("SINGLE MODEL TEST RESULTS");
    console.log("=".repeat(80));

    if (result.success) {
        console.log(`\n✅ SUCCESS: ${result.modelName}`);
        if (result.userTier) {
            console.log(`👤 User Tier: ${result.userTier}`);
        }
        if (result.originalName) {
            if (result.originalName !== result.modelName) {
                console.log(`🔄 Original name: ${result.originalName}`);
                console.log(`📝 Names are different - update needed`);
            } else {
                console.log(`✅ Original name matches: ${result.originalName}`);
            }
        } else {
            console.log(`⚠️  No original name found in response`);
        }

        if (result.responseTime) {
            console.log(`⏱️  Response time: ${result.responseTime}ms`);
        }

        if (result.tokenUsage) {
            console.log(`🔢 Token usage:`, result.tokenUsage);
        }
    } else {
        console.log(`\n❌ FAILED: ${result.modelName}`);
        console.log(`🚨 Error: ${result.error}`);
        if (result.errorType) {
            console.log(`📝 Error type: ${result.errorType}`);
        }
        if (result.statusCode) {
            console.log(`📊 Status code: ${result.statusCode}`);
        }
    }

    return result;
}

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);

    // Check for help flag
    if (args.includes("--help") || args.includes("-h")) {
        console.log("\n🔍 Model Original Name Discovery Script");
        console.log("=====================================\n");
        console.log("Usage:");
        console.log(
            "  node scripts/getOriginalModelNamesFromAPI.js [model_name]\n",
        );
        console.log("Examples:");
        console.log(
            "  node scripts/getOriginalModelNamesFromAPI.js              # Test all models",
        );
        console.log(
            '  node scripts/getOriginalModelNamesFromAPI.js openai       # Test only "openai" model',
        );
        console.log(
            '  node scripts/getOriginalModelNamesFromAPI.js qwen         # Test only "qwen" model\n',
        );
        console.log("Options:");
        console.log("  --help, -h    Show this help message\n");
        process.exit(0);
    }

    // Return the first argument as model name (if provided)
    return args[0] || null;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const modelName = parseArguments();

    if (modelName) {
        // Test single model
        testSingleModel(modelName)
            .then(() => process.exit(0))
            .catch((error) => {
                console.error("💥 Single model test failed:", error);
                process.exit(1);
            });
    } else {
        // Test all models (original behavior)
        discoverAllOriginalNames()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error("💥 Discovery failed:", error);
                process.exit(1);
            });
    }
}

export { discoverAllOriginalNames };
