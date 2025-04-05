require('dotenv').config({ path: '../../../.env' });
const axios = require('axios');
const readline = require('readline');

// --- Configuration ---
const ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID;
const AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN;
const API_BASE_URL = process.env.IMPACT_API_BASE_URL || 'https://api.impact.com'; // Default if not in .env

/**
 * Fetches campaign information for a campaign ID.
 * @param {string} campaignId - The ID of the campaign to fetch details for.
 * @returns {Promise<object|null>} - The campaign data or null if an error occurs.
 */
async function fetchCampaignInfo(campaignId) {
    if (!campaignId) {
        console.error(`[enrich_ad] Invalid CampaignId provided: ${campaignId}`);
        return null;
    }

    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        const url = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Campaigns/${campaignId}`;
        console.error(`[enrich_ad] Fetching campaign info for ID: ${campaignId} from ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`[enrich_ad] Error fetching campaign ${campaignId}:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        return null;
    }
}

/**
 * Processes a single ad by enriching it with campaign details.
 * @param {object} ad - The ad object to enrich.
 * @returns {Promise<object>} - The enriched ad object.
 */
async function enrichAdData(ad) {
    const enrichedAd = { ...ad };
    
    // Only proceed if we have a campaign ID
    if (ad.CampaignId) {
        console.error(`[enrich_ad] Processing campaign info for ad ${ad.Id} (${ad.Name})`);
        const campaignData = await fetchCampaignInfo(ad.CampaignId);
        
        if (campaignData) {
            // Extract relevant fields from campaign data based on our test results
            const campaignFields = {
                // Core campaign info
                'CampaignDescription': campaignData.CampaignDescription || null,
                'CampaignUrl': campaignData.CampaignUrl || null,
                
                // Advertiser info (from campaign data)
                'AdvertiserUrl': campaignData.AdvertiserUrl || null,
                
                // Additional useful campaign details
                'AllowsDeeplinking': campaignData.AllowsDeeplinking || null,
                'DeeplinkDomains': campaignData.DeeplinkDomains || null,
                
                // Shipping/target regions could be useful for geographic targeting
                'ShippingRegions': campaignData.ShippingRegions || null,
                
                // Contract status
                'ContractStatus': campaignData.ContractStatus || null 
            };
            
            // Add campaign fields to enriched ad
            Object.entries(campaignFields).forEach(([key, value]) => {
                if (value !== null) {
                    enrichedAd[key] = value;
                }
            });
            
            console.error(`[enrich_ad] Successfully enriched ad ${ad.Id} with campaign data`);
        } else {
            console.error(`[enrich_ad] Failed to enrich ad ${ad.Id} with campaign data`);
        }
    }
    
    return enrichedAd;
}

/**
 * Reads JSON data from stdin, processes each ad, and adds enrichment.
 */
async function processInput() {
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
        let ads = [];
        try {
            ads = JSON.parse(inputJson);
            if (!Array.isArray(ads)) {
                throw new Error('Input is not a JSON array.');
            }
        } catch (e) {
            console.error('[enrich_ad] Error parsing JSON input from stdin:', e.message);
            process.exit(1);
        }

        // Log the number of ads received
        console.error(`[enrich_ad] Received ${ads.length} ads to process.`);
        if (ads.length === 0) {
            console.error("[enrich_ad] No ads received, exiting.");
            process.stdout.write(JSON.stringify([])); // Output empty array
            return;
        }

        // Group ads by CampaignId to minimize duplicate API calls
        const adsByCampaignId = {};
        ads.forEach(ad => {
            const campaignId = ad.CampaignId || 'unknown';
            if (!adsByCampaignId[campaignId]) {
                adsByCampaignId[campaignId] = [];
            }
            adsByCampaignId[campaignId].push(ad);
        });

        console.error(`[enrich_ad] Found ${Object.keys(adsByCampaignId).length} unique campaigns to fetch.`);
        
        // Process each campaign group in parallel
        const results = [];
        const campaignIds = Object.keys(adsByCampaignId).filter(id => id !== 'unknown');
        
        // Fetch all campaign data in parallel
        console.error(`[enrich_ad] Fetching campaign data in parallel...`);
        const campaignDataPromises = campaignIds.map(async campaignId => {
            try {
                return {
                    campaignId,
                    data: await fetchCampaignInfo(campaignId)
                };
            } catch (error) {
                console.error(`[enrich_ad] Error fetching campaign ID ${campaignId}: ${error.message}`);
                return {
                    campaignId,
                    data: null
                };
            }
        });
        
        // Wait for all campaign data to be fetched
        const campaignDataResults = await Promise.all(campaignDataPromises);
        
        // Build a map of campaign data for quick lookup
        const campaignDataMap = {};
        campaignDataResults.forEach(result => {
            campaignDataMap[result.campaignId] = result.data;
        });
        
        // Enrich all ads with their campaign data
        console.error(`[enrich_ad] Enriching all ads with campaign data...`);
        for (const campaignId in adsByCampaignId) {
            const adsInCampaign = adsByCampaignId[campaignId];
            const campaignData = campaignDataMap[campaignId] || null;
            
            for (const ad of adsInCampaign) {
                try {
                    // Create enriched ad
                    const enrichedAd = { ...ad };
                    
                    // Only attempt to add campaign data if we have it
                    if (campaignData && campaignId !== 'unknown') {
                        // Add campaign fields directly to the ad
                        enrichedAd.CampaignDescription = campaignData.Description || null;
                        enrichedAd.CampaignUrl = campaignData.Url || null;
                        enrichedAd.AdvertiserUrl = campaignData.AdvertiserUrl || null;
                        enrichedAd.AllowsDeeplinking = campaignData.AllowsDeeplinking || null;
                        
                        // Add arrays as is
                        if (campaignData.DeeplinkDomains) {
                            enrichedAd.DeeplinkDomains = campaignData.DeeplinkDomains;
                        }
                        
                        if (campaignData.ShippingRegions) {
                            enrichedAd.ShippingRegions = campaignData.ShippingRegions;
                        }
                        
                        // Add contract status if available
                        if (campaignData.ContractStatus) {
                            enrichedAd.ContractStatus = campaignData.ContractStatus;
                        }
                        
                        console.error(`[enrich_ad] Successfully enriched ad ${ad.Id} with campaign data`);
                    } else if (campaignId === 'unknown') {
                        console.error(`[enrich_ad] Skipping campaign enrichment for ad ${ad.Id} (no CampaignId)`);
                    } else {
                        console.error(`[enrich_ad] Could not enrich ad ${ad.Id} (failed to fetch campaign data)`);
                    }
                    
                    results.push(enrichedAd);
                } catch (error) {
                    console.error(`[enrich_ad] Error enriching ad ${ad.Id}: ${error.message}`);
                    results.push(ad); // Add original ad on error
                }
            }
        }

        console.error(`[enrich_ad] Finished enrichment for ${results.length} ads.`);
        // Output the final combined JSON to stdout
        process.stdout.write(JSON.stringify(results, null, 2));
    });
}

// Run the main function
processInput(); 