require('dotenv').config({ path: '../../../.env' });
const axios = require('axios');

// Set to true to limit to 3 ads for testing, false for all ads
const TEST_MODE = false;
const TEST_ADS_LIMIT = 3;

// Configuration
const ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID;
const AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN;
const API_BASE_URL = process.env.IMPACT_API_BASE_URL || 'https://api.impact.com';

// Debug logs
console.error('[DEBUG] ACCOUNT_SID:', ACCOUNT_SID ? 'Exists (not showing for security)' : 'Missing');
console.error('[DEBUG] AUTH_TOKEN:', AUTH_TOKEN ? 'Exists (not showing for security)' : 'Missing');
console.error('[DEBUG] API_BASE_URL:', API_BASE_URL);

const ADS_URL = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Ads`;
console.error('[DEBUG] ADS_URL:', ADS_URL);

const PAGE_SIZE = 100;

/**
 * Fetches a single page of ads.
 * @param {number} page - The page number to fetch (starts at 1).
 * @returns {Promise<object>} - The API response data for that page.
 */
async function fetchAdsPage(page) {
    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        console.error(`[DEBUG] Fetching page ${page} from Impact API...`);
        
        const response = await axios.get(ADS_URL, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            },
            params: {
                'PageSize': PAGE_SIZE,
                'Page': page
            }
        });
        
        console.error(`[DEBUG] Got response for page ${page}, status: ${response.status}`);
        if (page === 1) {
            console.error('[DEBUG] First page response keys:', Object.keys(response.data));
            console.error('[DEBUG] Pagination info:', 
                response.data['@numpages'] ? `@numpages: ${response.data['@numpages']}` : 'No @numpages',
                response.data['@page'] ? `@page: ${response.data['@page']}` : 'No @page');
            console.error('[DEBUG] Ads count:', response.data.Ads ? response.data.Ads.length : 'No Ads key');
        }
        
        return response.data;
    } catch (error) {
        console.error(`Error fetching ads page ${page}:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }
        
        console.error(error.stack);
        throw new Error(`Failed to fetch ads page ${page}.`);
    }
}

// Main Execution
async function browseCatalog() {
    if (!ACCOUNT_SID || !AUTH_TOKEN) {
        console.error("Error: Missing IMPACT_ACCOUNT_SID or IMPACT_AUTH_TOKEN in .env file.");
        return;
    }

    try {
        // First fetch just page 1 to get total pages
        const firstPageData = await fetchAdsPage(1);
        const totalPages = parseInt(firstPageData['@numpages'] || '1');
        console.error(`[DEBUG] Found ${totalPages} total pages of ads`);
        
        // Add first page results to our collection
        let allAds = [];
        const firstPageAds = firstPageData.Ads || firstPageData.records || [];
        if (firstPageAds.length > 0) {
            allAds = allAds.concat(firstPageAds);
        }
        
        // Create array of promises for remaining pages (2 to totalPages)
        if (totalPages > 1) {
            console.error(`[DEBUG] Fetching remaining ${totalPages-1} pages in parallel`);
            
            // Create an array of page numbers from 2 to totalPages
            const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
            
            // Create an array of fetch promises
            const fetchPromises = remainingPages.map(page => fetchAdsPage(page));
            
            // Wait for all promises to resolve
            const pagesData = await Promise.all(fetchPromises);
            
            // Extract ads from each page and add to allAds
            pagesData.forEach(pageData => {
                const pageAds = pageData.Ads || pageData.records || [];
                if (pageAds.length > 0) {
                    allAds = allAds.concat(pageAds);
                }
            });
        }

        // Process all ads without filtering by type
        console.error(`[DEBUG] Processing ${allAds.length} total ads (no type filtering)`);
        
        // Limit ads if in test mode
        let processedAds = allAds;
        if (TEST_MODE) {
            processedAds = allAds.slice(0, TEST_ADS_LIMIT);
            console.error(`[DEBUG] TEST MODE: Limited to ${processedAds.length} ads for testing`);
        }
        
        // Clean up and include only allowed fields
        const cleanedAds = processedAds.map(ad => {
            const allowedFields = [
                'Id', 'Name', 'Description', 'CampaignId', 'CampaignName', 'Type', 
                'TrackingLink', 'LandingPageUrl', 'AdvertiserName', 'Labels', 
                'AllowDeepLinking', 'MobileReady', 'Language', 'StartDate', 'TopSeller',
                'AffiliateAudience', 'AffiliateProduct', 'AffiliateCategory'
            ];
            
            const cleanedAd = {};
            for (const field of allowedFields) {
                const value = ad[field];
                
                // Check for empty values
                const isEmptyArray = Array.isArray(value) && value.length === 0;
                const isEmptyObject = typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
                
                if (value !== null && value !== undefined && value !== "" && !isEmptyArray && !isEmptyObject) {
                    cleanedAd[field] = value;
                }
            }
            return cleanedAd;
        });

        // Output the final JSON
        process.stdout.write(JSON.stringify(cleanedAds, null, 2));

    } catch (error) {
        console.error("\n--- Script terminated due to error ---");
        console.error(error.message);
        process.exit(1);
    }
}

// Run the main function
browseCatalog();
