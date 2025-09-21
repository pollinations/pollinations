#!/usr/bin/env node

/**
 * Test script for Gemini image generation integration
 * Tests the complete flow from authentication to image generation
 */

import dotenv from "dotenv";
import debug from "debug";
import { testVertexAIConnection } from "./src/vertexAIClient.ts";
import { callVertexAIGemini } from "./src/vertexAIImageGenerator.ts";
import { writeFileSync } from "fs";

// Load environment variables
dotenv.config();

// Enable debug logging
debug.enabled = () => true;

const log = debug("pollinations:test");
const errorLog = debug("pollinations:test:error");

async function testGeminiIntegration() {
    try {
        log("🧪 Starting Gemini integration test...");

        // Test 1: Basic connection test
        log("📡 Testing Vertex AI connection...");
        const connectionTest = await testVertexAIConnection();
        if (!connectionTest) {
            throw new Error("Vertex AI connection test failed");
        }
        log("✅ Vertex AI connection test passed");

        // Test 2: Full integration test
        log("🎨 Testing full image generation flow...");
        
        const testParams = {
            model: "gemini-image",
            width: 512,
            height: 512,
            image: [] // No reference images for this test
        };

        const testUserInfo = {
            authenticated: true,
            tier: "seed", // Required for gemini-image
            userId: "test-user"
        };

        const result = await callVertexAIGemini(
            "A beautiful sunset over mountains with vibrant colors",
            testParams,
            testUserInfo
        );

        log("✅ Image generation successful!");
        log("📊 Result details:");
        log("  - MIME type:", result.mimeType);
        log("  - Image size:", result.imageBuffer.length, "bytes");
        log("  - Model:", result.model);
        log("  - Generator:", result.generator);
        if (result.textResponse) {
            log("  - Text response:", result.textResponse);
        }
        if (result.usage) {
            log("  - Token usage:", result.usage);
        }

        // Save the generated image for inspection
        const filename = `test-gemini-output-${Date.now()}.png`;
        writeFileSync(filename, result.imageBuffer);
        log("💾 Image saved as:", filename);

        log("🎉 All tests passed! Gemini integration is working correctly.");
        return true;

    } catch (error) {
        errorLog("❌ Test failed:", error.message);
        errorLog("Stack trace:", error.stack);
        return false;
    }
}

// Run the test
testGeminiIntegration()
    .then(success => {
        if (success) {
            log("🚀 Integration test completed successfully!");
            process.exit(0);
        } else {
            errorLog("💥 Integration test failed!");
            process.exit(1);
        }
    })
    .catch(error => {
        errorLog("💥 Unexpected error:", error);
        process.exit(1);
    });
