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

// Configuration
const ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID;
const AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN;
const API_BASE_URL = process.env.IMPACT_API_BASE_URL || 'https://api.impact.com';
const MEDIA_PARTNER_PROPERTY_ID = process.env.IMPACT_MEDIA_PARTNER_PROPERTY_ID;

// Set to true to limit to a few campaign IDs for testing, false for all
const TEST_MODE = false;
const TEST_LIMIT = 3;

// Debug logs
console.error('[DEBUG] ACCOUNT_SID:', ACCOUNT_SID ? 'Exists (not showing for security)' : 'Missing');
console.error('[DEBUG] AUTH_TOKEN:', AUTH_TOKEN ? 'Exists (not showing for security)' : 'Missing');
console.error('[DEBUG] API_BASE_URL:', API_BASE_URL);
console.error('[DEBUG] MEDIA_PARTNER_PROPERTY_ID:', MEDIA_PARTNER_PROPERTY_ID || 'Missing');

// First get all media properties
const MEDIA_PROPERTIES_URL = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/MediaProperties`;
console.error('[DEBUG] MEDIA_PROPERTIES_URL:', MEDIA_PROPERTIES_URL);

/**
 * Fetches all media properties.
 * @returns {Promise<Array>} - The list of media properties.
 */
async function fetchMediaProperties() {
    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        console.error(`[DEBUG] Fetching media properties from Impact API...`);
        
        const response = await axios.get(MEDIA_PROPERTIES_URL, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        });
        
        console.error(`[DEBUG] Got response for media properties, status: ${response.status}`);
        console.error('[DEBUG] Media properties response keys:', Object.keys(response.data));
        
        const mediaProperties = response.data.MediaProperties || [];
        console.error(`[DEBUG] Found ${mediaProperties.length} media properties`);
        
        if (mediaProperties.length > 0) {
            console.error('[DEBUG] First media property:', JSON.stringify(mediaProperties[0], null, 2));
        }
        
        return mediaProperties;
    } catch (error) {
        console.error(`Error fetching media properties:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }
        
        throw new Error(`Failed to fetch media properties.`);
    }
}

// First get all campaigns
const CAMPAIGNS_URL = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Campaigns`;
console.error('[DEBUG] CAMPAIGNS_URL:', CAMPAIGNS_URL);

/**
 * Fetches a single page of campaigns.
 * @param {number} page - The page number to fetch (starts at 1).
 * @returns {Promise<object>} - The API response data for that page.
 */
async function fetchCampaignsPage(page) {
    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        console.error(`[DEBUG] Fetching campaigns page ${page} from Impact API...`);
        
        const response = await axios.get(CAMPAIGNS_URL, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            },
            params: {
                'PageSize': 100,
                'Page': page
            }
        });
        
        console.error(`[DEBUG] Got response for page ${page}, status: ${response.status}`);
        if (page === 1) {
            console.error('[DEBUG] First page response keys:', Object.keys(response.data));
            console.error('[DEBUG] Pagination info:', 
                response.data['@numpages'] ? `@numpages: ${response.data['@numpages']}` : 'No @numpages',
                response.data['@page'] ? `@page: ${response.data['@page']}` : 'No @page');
        }
        
        return response.data;
    } catch (error) {
        console.error(`Error fetching campaigns page ${page}:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }
        
        throw new Error(`Failed to fetch campaigns page ${page}.`);
    }
}

/**
 * Creates a tracking link for a specific campaign.
 * @param {string} campaignId - The ID of the campaign to create a tracking link for.
 * @param {string} deepLink - Optional deep link URL.
 * @param {string} type - Type of tracking link (Regular or Vanity).
 * @param {string} mediaPropertyId - The media property ID to use.
 * @returns {Promise<object>} - The API response with the tracking link.
 */
async function createTrackingLink(campaignId, deepLink = null, type = 'Regular', mediaPropertyId = null) {
    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        // According to docs, we should use Programs not Campaigns for the tracking links endpoint
        const trackingLinksUrl = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Programs/${campaignId}/TrackingLinks`;
        console.error(`[DEBUG] Creating tracking link for campaign/program ID: ${campaignId}`);
        
        // Build query parameters
        const params = {
            'Type': type,
            'subId1': 'pollinations',
            'sharedId': `campaign-${campaignId}`
        };

        // Add media property ID if provided
        if (mediaPropertyId) {
            params.MediaPartnerPropertyId = mediaPropertyId;
        }
        
        // Add deep link if provided
        if (deepLink) {
            params.DeepLink = deepLink;
        }
        
        const response = await axios.post(trackingLinksUrl, null, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            },
            params: params
        });
        
        console.error(`[DEBUG] Successfully created tracking link for campaign/program ${campaignId}`);
        return {
            campaignId,
            ...response.data
        };
    } catch (error) {
        console.error(`Error creating tracking link for campaign/program ${campaignId}:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }
        
        return {
            campaignId,
            error: error.message,
            errorDetails: error.response?.data || {}
        };
    }
}

// Main Execution
async function generateTrackingLinks() {
    if (!ACCOUNT_SID || !AUTH_TOKEN) {
        console.error("Error: Missing IMPACT_ACCOUNT_SID or IMPACT_AUTH_TOKEN in .env file.");
        process.exit(1);
    }

    try {
        // First fetch media properties to get a valid media property ID
        const mediaProperties = await fetchMediaProperties();
        let mediaPropertyId = MEDIA_PARTNER_PROPERTY_ID;
        
        if (mediaProperties.length > 0) {
            // Use the first media property ID from the API response
            mediaPropertyId = mediaProperties[0].Id || mediaProperties[0].id;
            console.error(`[DEBUG] Using media property ID from API: ${mediaPropertyId}`);
        } else {
            console.error(`[DEBUG] No media properties found, using default ID: ${mediaPropertyId}`);
        }
        
        // Now fetch campaigns
        const firstPageData = await fetchCampaignsPage(1);
        const totalPages = parseInt(firstPageData['@numpages'] || '1');
        console.error(`[DEBUG] Found ${totalPages} total pages of campaigns`);
        
        // Add first page results to our collection
        let allCampaigns = [];
        const firstPageCampaigns = firstPageData.Campaigns || [];
        
        // Debug the structure of the first campaign
        if (firstPageCampaigns.length > 0) {
            console.error('[DEBUG] First campaign object keys:', Object.keys(firstPageCampaigns[0]));
            console.error('[DEBUG] First campaign ID field:', 
                firstPageCampaigns[0].Id || 
                firstPageCampaigns[0].id || 
                firstPageCampaigns[0].CampaignId || 
                firstPageCampaigns[0].campaignId || 
                'Not found');
            
            allCampaigns = allCampaigns.concat(firstPageCampaigns);
        }
        
        // Create array of promises for remaining pages (2 to totalPages)
        if (totalPages > 1) {
            console.error(`[DEBUG] Fetching remaining ${totalPages-1} pages in parallel`);
            
            // Create an array of page numbers from 2 to totalPages
            const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
            
            // Create an array of fetch promises
            const fetchPromises = remainingPages.map(page => fetchCampaignsPage(page));
            
            // Wait for all promises to resolve
            const pagesData = await Promise.all(fetchPromises);
            
            // Extract campaigns from each page and add to allCampaigns
            pagesData.forEach(pageData => {
                const pageCampaigns = pageData.Campaigns || [];
                if (pageCampaigns.length > 0) {
                    allCampaigns = allCampaigns.concat(pageCampaigns);
                }
            });
        }

        console.error(`[DEBUG] Processing ${allCampaigns.length} total campaigns`);
        
        // Limit campaigns if in test mode
        let campaignsToProcess = allCampaigns;
        if (TEST_MODE) {
            campaignsToProcess = allCampaigns.slice(0, TEST_LIMIT);
            console.error(`[DEBUG] TEST MODE: Limited to ${campaignsToProcess.length} campaigns for testing`);
        }
        
        // Create tracking links for all campaigns
        console.error(`[DEBUG] Creating tracking links for ${campaignsToProcess.length} campaigns`);
        
        const trackingLinkPromises = campaignsToProcess.map(campaign => {
            // Log the full campaign object for the first few campaigns
            if (campaignsToProcess.indexOf(campaign) < 2) {
                console.error(`[DEBUG] Campaign ${campaignsToProcess.indexOf(campaign)} full object:`, JSON.stringify(campaign, null, 2));
            }
            
            // Use the correct ID field based on the API response
            const campaignId = campaign.Id || campaign.id || campaign.CampaignId || campaign.campaignId;
            const deepLink = campaign.Url || campaign.url || campaign.CampaignUrl || campaign.campaignUrl || null;
            
            console.error(`[DEBUG] Using campaign ID: ${campaignId}, Deep Link: ${deepLink}`);
            
            // Pass the valid media property ID
            return createTrackingLink(campaignId, deepLink, 'Regular', mediaPropertyId);
        });
        
        const trackingLinkResults = await Promise.all(trackingLinkPromises);
        
        // Combine campaign data with tracking link data
        const combinedResults = trackingLinkResults.map(result => {
            const campaign = campaignsToProcess.find(c => c.Id === result.campaignId);
            if (!campaign) return result;
            
            return {
                // Campaign info
                campaignId: campaign.Id,
                campaignName: campaign.Name,
                campaignDescription: campaign.Description,
                advertiserName: campaign.AdvertiserName,
                campaignUri: campaign.Url,
                campaignStatus: campaign.CampaignStatus,
                
                // Tracking link info
                trackingLink: result.TrackingLink || null,
                trackingLinkId: result.Id || null,
                deepLink: result.DeepLink || null,
                error: result.error || null,
                
                // Additional useful info
                createdDate: new Date().toISOString()
            };
        });

        // Output the final JSON
        process.stdout.write(JSON.stringify(combinedResults, null, 2));

    } catch (error) {
        console.error("\n--- Script terminated due to error ---");
        console.error(error.message);
        process.exit(1);
    }
}

// Run the main function
generateTrackingLinks(); 