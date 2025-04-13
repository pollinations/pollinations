// Try to load .env from different locations
try {
    require('dotenv').config({ path: '../../../.env' });
    // If main values are missing, try the root .env file
    if (!process.env.IMPACT_ACCOUNT_SID || !process.env.IMPACT_AUTH_TOKEN) {
        console.error('[DEBUG] Could not find environment variables in affiliate/.env, trying root .env');
        require('dotenv').config({ path: '/Users/comsom/Github/pollinations/.env' });
    }
} catch (error) {
    console.error('[DEBUG] Error loading .env file:', error.message);
}

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
        console.error(`[enrich_tracking] Invalid campaignId provided: ${campaignId}`);
        return null;
    }

    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        const url = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Campaigns/${campaignId}`;
        console.error(`[enrich_tracking] Fetching campaign info for ID: ${campaignId} from ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`[enrich_tracking] Error fetching campaign ${campaignId}:`);
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
 * Enriches a tracking link with additional campaign information.
 * @param {object} trackingLink - The tracking link object to enrich.
 * @returns {Promise<object>} - The enriched tracking link object.
 */
async function enrichTrackingLink(trackingLink) {
    const enrichedLink = { ...trackingLink };
    
    // Only proceed if we have a campaign ID
    if (trackingLink.campaignId) {
        console.error(`[enrich_tracking] Processing campaign info for tracking link with campaign ID ${trackingLink.campaignId}`);
        const campaignData = await fetchCampaignInfo(trackingLink.campaignId);
        
        if (campaignData) {
            // Extract relevant fields from campaign data
            const campaignFields = {
                // Core campaign info
                'CampaignDescription': campaignData.CampaignDescription || campaignData.Description || null,
                
                // Advertiser info (from campaign data)
                'AdvertiserId': campaignData.AdvertiserId || null,
                'AdvertiserUrl': campaignData.AdvertiserUrl || null,
                
                // Additional useful campaign details
                'AllowsDeeplinking': campaignData.AllowsDeeplinking || null,
                'DeeplinkDomains': campaignData.DeeplinkDomains || null,
                
                // Shipping/target regions could be useful for geographic targeting
                'ShippingRegions': campaignData.ShippingRegions || null,
                
                // Contract status
                'ContractStatus': campaignData.ContractStatus || null,
                
                // Logo URI
                'CampaignLogoUri': campaignData.CampaignLogoUri || null,
                
                // Last update time
                'LastUpdate': new Date().toISOString()
            };
            
            // Add campaign fields to enriched tracking link
            Object.entries(campaignFields).forEach(([key, value]) => {
                if (value !== null) {
                    enrichedLink[key] = value;
                }
            });
            
            console.error(`[enrich_tracking] Successfully enriched tracking link for campaign ${trackingLink.campaignId}`);
        } else {
            console.error(`[enrich_tracking] Failed to enrich tracking link for campaign ${trackingLink.campaignId}`);
            enrichedLink.enrichmentError = "Failed to fetch campaign data";
        }
    } else {
        console.error(`[enrich_tracking] No campaign ID found for this tracking link`);
        enrichedLink.enrichmentError = "No campaign ID available";
    }
    
    return enrichedLink;
}

/**
 * Reads JSON data from stdin, processes each tracking link, and adds enrichment.
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
        let trackingLinks = [];
        try {
            trackingLinks = JSON.parse(inputJson);
            if (!Array.isArray(trackingLinks)) {
                throw new Error('Input is not a JSON array.');
            }
        } catch (e) {
            console.error('[enrich_tracking] Error parsing JSON input from stdin:', e.message);
            process.exit(1);
        }

        // Log the number of tracking links received
        console.error(`[enrich_tracking] Received ${trackingLinks.length} tracking links to process.`);
        if (trackingLinks.length === 0) {
            console.error("[enrich_tracking] No tracking links received, exiting.");
            process.stdout.write(JSON.stringify([])); // Output empty array
            return;
        }

        // Group tracking links by campaignId to minimize duplicate API calls
        const linksByCampaignId = {};
        trackingLinks.forEach(link => {
            const campaignId = link.campaignId || 'unknown';
            if (!linksByCampaignId[campaignId]) {
                linksByCampaignId[campaignId] = [];
            }
            linksByCampaignId[campaignId].push(link);
        });

        console.error(`[enrich_tracking] Found ${Object.keys(linksByCampaignId).length} unique campaigns to fetch.`);
        
        // Process all campaign IDs in parallel
        const results = [];
        const campaignIds = Object.keys(linksByCampaignId).filter(id => id !== 'unknown');
        
        // Fetch all campaign data in parallel
        console.error(`[enrich_tracking] Fetching campaign data in parallel...`);
        const campaignDataPromises = campaignIds.map(async campaignId => {
            try {
                return {
                    campaignId,
                    data: await fetchCampaignInfo(campaignId)
                };
            } catch (error) {
                console.error(`[enrich_tracking] Error fetching campaign ID ${campaignId}: ${error.message}`);
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
        
        // Enrich all tracking links with their campaign data
        console.error(`[enrich_tracking] Enriching all tracking links with campaign data...`);
        for (const campaignId in linksByCampaignId) {
            const linksInCampaign = linksByCampaignId[campaignId];
            const campaignData = campaignDataMap[campaignId] || null;
            
            for (const link of linksInCampaign) {
                try {
                    // Create enriched tracking link
                    const enrichedLink = { ...link };
                    
                    // Only attempt to add campaign data if we have it
                    if (campaignData && campaignId !== 'unknown') {
                        // Add campaign fields directly to the link
                        enrichedLink.CampaignDescription = campaignData.Description || null;
                        enrichedLink.AdvertiserId = campaignData.AdvertiserId || null;
                        enrichedLink.AdvertiserUrl = campaignData.AdvertiserUrl || null;
                        enrichedLink.AllowsDeeplinking = campaignData.AllowsDeeplinking || null;
                        
                        // Add arrays as is
                        if (campaignData.DeeplinkDomains) {
                            enrichedLink.DeeplinkDomains = campaignData.DeeplinkDomains;
                        }
                        
                        if (campaignData.ShippingRegions) {
                            enrichedLink.ShippingRegions = campaignData.ShippingRegions;
                        }
                        
                        // Add additional useful information
                        if (campaignData.ContractStatus) {
                            enrichedLink.ContractStatus = campaignData.ContractStatus;
                        }
                        
                        if (campaignData.CampaignLogoUri) {
                            enrichedLink.CampaignLogoUri = campaignData.CampaignLogoUri;
                        }
                        
                        // Add timestamps
                        enrichedLink.LastUpdate = new Date().toISOString();
                        
                        console.error(`[enrich_tracking] Successfully enriched tracking link for campaign ${campaignId}`);
                    } else if (campaignId === 'unknown') {
                        console.error(`[enrich_tracking] Skipping campaign enrichment for tracking link (no campaignId)`);
                        enrichedLink.enrichmentError = "No campaign ID available";
                    } else {
                        console.error(`[enrich_tracking] Could not enrich tracking link (failed to fetch campaign data)`);
                        enrichedLink.enrichmentError = "Failed to fetch campaign data";
                    }
                    
                    results.push(enrichedLink);
                } catch (error) {
                    console.error(`[enrich_tracking] Error enriching tracking link for campaign ${campaignId}: ${error.message}`);
                    // Add the original link on error with error info
                    link.enrichmentError = error.message;
                    results.push(link);
                }
            }
        }

        console.error(`[enrich_tracking] Finished enrichment for ${results.length} tracking links.`);
        // Output the final combined JSON to stdout
        process.stdout.write(JSON.stringify(results, null, 2));
    });
}

// Run the main function
processInput(); 