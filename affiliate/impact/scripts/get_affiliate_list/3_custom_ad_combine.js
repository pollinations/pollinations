const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Reads JSON data from stdin, combines it with extra affiliates, and outputs the combined result.
 */
async function processInput() {
    // Updated path to the custom affiliates JSON file
    const customAffiliatesPath = path.join(__dirname, '../../../custom_affiliate_list.json');
    
    // Read from stdin
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    let inputJson = '';

    rl.on('line', (line) => {
        inputJson += line;
    });

    rl.on('close', async () => {
        let enrichedAds = [];
        try {
            enrichedAds = JSON.parse(inputJson);
            if (!Array.isArray(enrichedAds)) {
                throw new Error('Input is not a JSON array.');
            }
        } catch (e) {
            console.error('[combine_affiliates] Error parsing JSON input from stdin:', e.message);
            process.exit(1);
        }

        console.error(`[combine_affiliates] Received ${enrichedAds.length} enriched ads from previous step.`);
        
        // Read custom affiliates JSON file
        let customAffiliates = [];
        try {
            if (fs.existsSync(customAffiliatesPath)) {
                const customAffiliatesJson = fs.readFileSync(customAffiliatesPath, 'utf8');
                customAffiliates = JSON.parse(customAffiliatesJson);
                
                if (!Array.isArray(customAffiliates)) {
                    console.error(`[combine_affiliates] Warning: Custom affiliates file is not an array. Skipping.`);
                    customAffiliates = [];
                } else {
                    console.error(`[combine_affiliates] Loaded ${customAffiliates.length} custom affiliates from ${customAffiliatesPath}`);
                    
                    // Process each custom affiliate to match our expected format
                    customAffiliates = customAffiliates.map(affiliate => {
                        // Convert fields to match the casing of our main ads
                        return {
                            Id: affiliate.id || '',
                            Name: affiliate.advertiserName || '',
                            Description: affiliate.description || '',
                            Type: affiliate.type || '',
                            TrackingLink: affiliate.trackingLink || '',
                            LandingPageUrl: affiliate.landingPageUrl || '',
                            AdvertiserName: affiliate.advertiserName || '',
                            Labels: affiliate.labels || '',
                            MobileReady: affiliate.mobileReady || '',
                            Language: affiliate.language || '',
                            TopSeller: affiliate.topSeller || 'false',
                            // Custom flag to identify these as manually added
                            isCustomAffiliate: true
                        };
                    });
                }
            } else {
                console.error(`[combine_affiliates] Warning: Custom affiliates file not found at ${customAffiliatesPath}. Continuing with only enriched ads.`);
            }
        } catch (error) {
            console.error(`[combine_affiliates] Error reading custom affiliates file: ${error.message}. Continuing with only enriched ads.`);
        }
        
        // Combine the ads
        const combinedAds = [...enrichedAds, ...customAffiliates];
        console.error(`[combine_affiliates] Combined ${enrichedAds.length} enriched ads with ${customAffiliates.length} custom affiliates for a total of ${combinedAds.length} ads.`);
        
        // Output the combined JSON to stdout
        process.stdout.write(JSON.stringify(combinedAds, null, 2));
    });
}

// Run the main function
processInput(); 