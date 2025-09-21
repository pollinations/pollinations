#!/usr/bin/env node

/**
 * Test script for Gemini image-to-image functionality
 * Tests the nano banana model with reference images
 */

import { generateImageWithVertexAI } from "./src/vertexAIClient.ts";
import { callVertexAIGemini } from "./src/vertexAIImageGenerator.ts";
import { writeFileSync } from "fs";
import debug from "debug";

const log = debug("pollinations:test-gemini-i2i");

// Test reference images (publicly accessible)
const TEST_REFERENCE_IMAGES = [
    "https://image.pollinations.ai/prompt/a%20cute%20cat?width=512&height=512&seed=42",
    "https://image.pollinations.ai/prompt/a%20beautiful%20sunset?width=512&height=512&seed=123"
];

async function testImageToImage() {
    try {
        log("🧪 Testing Gemini Image-to-Image functionality...");
        
        // Test 1: Direct Vertex AI client test
        log("\n📡 Test 1: Direct Vertex AI client with reference images");
        const directResult = await generateImageWithVertexAI({
            prompt: "Create a surreal artwork combining elements from the reference images, with vibrant colors and artistic style",
            width: 1024,
            height: 1024,
            referenceImages: TEST_REFERENCE_IMAGES
        });
        
        log("✅ Direct client test successful!");
        log("- Image data length:", directResult.imageData.length);
        log("- MIME type:", directResult.mimeType);
        log("- Text response:", directResult.textResponse?.substring(0, 100) || "None");
        
        // Save the direct result
        const directImageBuffer = Buffer.from(directResult.imageData, 'base64');
        writeFileSync('./test-gemini-direct-i2i.jpg', directImageBuffer);
        log("💾 Saved direct result to: test-gemini-direct-i2i.jpg");
        
        // Test 2: Full integration test
        log("\n🔧 Test 2: Full integration through callVertexAIGemini");
        const mockUserInfo = {
            authenticated: true,
            tier: "seed",
            userId: "test-user",
            username: "test"
        };
        
        const mockParams = {
            width: 1024,
            height: 1024,
            model: "gemini-image",
            image: TEST_REFERENCE_IMAGES, // Reference images
            seed: 42,
            enhance: false,
            nologo: false,
            safe: false,
            nofeed: false
        };
        
        const integrationResult = await callVertexAIGemini(
            "Transform the reference images into a cyberpunk-style artwork with neon colors",
            mockParams,
            mockUserInfo
        );
        
        log("✅ Integration test successful!");
        log("- Buffer size:", integrationResult.buffer.length);
        log("- Is mature:", integrationResult.isMature);
        log("- Is child:", integrationResult.isChild);
        
        // Save the integration result
        writeFileSync('./test-gemini-integration-i2i.jpg', integrationResult.buffer);
        log("💾 Saved integration result to: test-gemini-integration-i2i.jpg");
        
        // Test 3: Test with no reference images (baseline)
        log("\n🎯 Test 3: Baseline test without reference images");
        const baselineResult = await callVertexAIGemini(
            "A futuristic cityscape with flying cars",
            { ...mockParams, image: [] }, // No reference images
            mockUserInfo
        );
        
        log("✅ Baseline test successful!");
        writeFileSync('./test-gemini-baseline.jpg', baselineResult.buffer);
        log("💾 Saved baseline result to: test-gemini-baseline.jpg");
        
        log("\n🎉 All tests completed successfully!");
        log("\nGenerated files:");
        log("- test-gemini-direct-i2i.jpg (direct client with reference images)");
        log("- test-gemini-integration-i2i.jpg (full integration with reference images)");
        log("- test-gemini-baseline.jpg (no reference images)");
        
        log("\n📊 Image-to-Image Status: ✅ FULLY IMPLEMENTED");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        console.error("Full error:", error);
        process.exit(1);
    }
}

// Run the test
testImageToImage();
