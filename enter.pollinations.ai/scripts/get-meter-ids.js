import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    server: "sandbox", // Change to "production" if needed
});

async function getMeters() {
    try {
        console.log("🔍 Fetching all meters from Polar...\n");
        
        const response = await polar.meters.list({
            organizationId: undefined, // List all meters
        });
        
        if (!response || !response.result || !response.result.items) {
            console.error("❌ No meters found");
            console.error("Response structure:", Object.keys(response || {}));
            return;
        }
        
        const meters = response.result.items;
        
        console.log(`✅ Found ${meters.length} meters:\n`);
        
        meters.forEach(meter => {
            console.log(`📊 ${meter.name}`);
            console.log(`   ID: ${meter.id}`);
            console.log(`   Type: ${meter.type || 'N/A'}`);
            console.log(`   Created: ${new Date(meter.createdAt).toLocaleDateString()}`);
            console.log("");
        });
        
        // Find specific meters we care about
        const tierMeter = meters.find(m => m.name === "Pollen (tier)");
        const packMeter = meters.find(m => m.name === "Pollen (pack)");
        
        if (tierMeter || packMeter) {
            console.log("🎯 NEW Meters for dual-meter system:");
            if (tierMeter) {
                console.log(`   Tier Meter ID: ${tierMeter.id}`);
            }
            if (packMeter) {
                console.log(`   Pack Meter ID: ${packMeter.id}`);
            }
        }
        
    } catch (error) {
        console.error("❌ Error fetching meters:", error.message);
    }
}

getMeters();
