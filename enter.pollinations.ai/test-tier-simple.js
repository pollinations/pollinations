/**
 * Simple test to replicate tier activation error locally
 * Run: node test-tier-simple.js
 */

const BASE_URL = "http://localhost:3000";

async function testTierActivation() {
    console.log("🧪 Testing tier activation endpoint...\n");

    // Test 1: Without authentication (should fail with 401)
    console.log("Test 1: No authentication");
    try {
        const response = await fetch(`${BASE_URL}/api/tiers/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_tier: "nectar" }),
        });
        
        const data = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${data}\n`);
    } catch (error) {
        console.error(`Error: ${error.message}\n`);
    }

    // Test 2: Check if server is running
    console.log("Test 2: Health check");
    try {
        const response = await fetch(`${BASE_URL}/`);
        console.log(`Status: ${response.status}`);
        console.log(`Server is ${response.ok ? "✅ running" : "❌ not responding"}\n`);
    } catch (error) {
        console.error(`❌ Server not running: ${error.message}`);
        console.log("\nRun: npm run dev\n");
        process.exit(1);
    }

    console.log("📝 To test with authentication:");
    console.log("1. Open http://localhost:3000 in browser");
    console.log("2. Log in with GitHub");
    console.log("3. Open DevTools > Network tab");
    console.log("4. Try activating a tier");
    console.log("5. Check the request/response in Network tab");
}

testTierActivation().catch(console.error);
