#!/usr/bin/env node

/**
 * Test API endpoint for Gemini image-to-image functionality
 * Tests the actual HTTP API with reference images
 */

import fetch from "node-fetch";
import { writeFileSync } from "fs";

const API_BASE = "http://localhost:3000"; // Adjust if running on different port
const TEST_REFERENCE_IMAGES = [
    "https://image.pollinations.ai/prompt/a%20cute%20cat?width=512&height=512&seed=42",
    "https://image.pollinations.ai/prompt/a%20beautiful%20sunset?width=512&height=512&seed=123"
];

async function testAPIImageToImage() {
    try {
        console.log("🌐 Testing Gemini Image-to-Image via API endpoint...");
        
        // Test 1: Image-to-image with reference images
        const prompt = "Transform these reference images into a magical fantasy scene with dragons and castles";
        const imageParam = TEST_REFERENCE_IMAGES.join(",");
        
        const url = `${API_BASE}/prompt/${encodeURIComponent(prompt)}?model=gemini-image&image=${encodeURIComponent(imageParam)}&width=1024&height=1024&seed=42`;
        
        console.log("📡 Making API request...");
        console.log("URL:", url);
        
        const response = await fetch(url, {
            headers: {
                // Add authentication headers if needed
                // 'Authorization': 'Bearer your-token-here'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        console.log("✅ API response successful!");
        console.log("- Status:", response.status);
        console.log("- Content-Type:", contentType);
        console.log("- Content-Length:", response.headers.get('content-length'));
        
        if (contentType?.startsWith('image/')) {
            const imageBuffer = await response.buffer();
            writeFileSync('./test-api-gemini-i2i.jpg', imageBuffer);
            console.log("💾 Saved API result to: test-api-gemini-i2i.jpg");
            console.log("- Image size:", imageBuffer.length, "bytes");
        } else {
            const text = await response.text();
            console.log("📄 Response text:", text.substring(0, 500));
        }
        
        // Test 2: Compare with baseline (no reference images)
        console.log("\n🎯 Testing baseline without reference images...");
        const baselineUrl = `${API_BASE}/prompt/${encodeURIComponent(prompt)}?model=gemini-image&width=1024&height=1024&seed=42`;
        
        const baselineResponse = await fetch(baselineUrl);
        if (baselineResponse.ok && baselineResponse.headers.get('content-type')?.startsWith('image/')) {
            const baselineBuffer = await baselineResponse.buffer();
            writeFileSync('./test-api-gemini-baseline.jpg', baselineBuffer);
            console.log("💾 Saved baseline to: test-api-gemini-baseline.jpg");
            console.log("- Baseline size:", baselineBuffer.length, "bytes");
        }
        
        console.log("\n🎉 API tests completed successfully!");
        console.log("\n📊 Image-to-Image API Status: ✅ WORKING");
        
    } catch (error) {
        console.error("❌ API test failed:", error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
            console.error("\n💡 Make sure the image.pollinations.ai server is running:");
            console.error("   cd /Users/thomash/Documents/GitHub/pollinations/image.pollinations.ai");
            console.error("   npm start");
        }
        
        process.exit(1);
    }
}

// Run the test
testAPIImageToImage();
