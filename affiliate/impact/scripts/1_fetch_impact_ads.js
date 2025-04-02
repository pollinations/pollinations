require('dotenv').config({ path: '../../../.env' });
const axios = require('axios');

// --- Configuration ---
const ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID;
const AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN;
const API_BASE_URL = process.env.IMPACT_API_BASE_URL || 'https://api.impact.com'; // Default if not in .env

const ADS_URL = `${API_BASE_URL}/Mediapartners/${ACCOUNT_SID}/Ads`;

const PAGE_SIZE = 100; // How many ads to fetch per API call (adjust as needed, check API limits)

/**
 * Fetches a single page of ads.
 * @param {number} page - The page number to fetch (starts at 1).
 * @returns {Promise<object>} - The API response data for that page.
 */
async function fetchAdsPage(page) {
    try {
        // Create Basic Auth credentials
        const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
        
        const response = await axios.get(ADS_URL, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            },
            params: {
                'PageSize': PAGE_SIZE,
                'Page': page
                // Add other filters here if needed, e.g., 'AdvertiserId=1234'
            }
        });
        return response.data; // Assumes response.data contains ads array and pagination info
    } catch (error) {
        console.error(`Error fetching ads page ${page}:`);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        // Depending on requirements, you might want to retry or just skip this page
        throw new Error(`Failed to fetch ads page ${page}.`);
    }
}

// --- Main Execution ---
async function browseCatalog() {
    if (!ACCOUNT_SID || !AUTH_TOKEN) {
        console.error("Error: Missing IMPACT_ACCOUNT_SID or IMPACT_AUTH_TOKEN in .env file.");
        return;
    }

    try {
        let allAds = [];
        let currentPage = 1;
        let totalPages = 1; // Assume at least one page initially

        do {
            const pageData = await fetchAdsPage(currentPage);

            // --- IMPORTANT: Inspect pageData structure ---
            // You NEED to know the exact keys for ads array and pagination.
            // Common structures:
            // pageData.Ads, pageData['@numpages'], pageData['@page']
            // pageData.records, pageData.TotalPages, pageData.Page
            // Log the first response to find the correct keys:
            if (currentPage === 1) {
                 // --- ADJUST THE KEYS BELOW BASED ON ACTUAL RESPONSE ---
                 totalPages = parseInt(pageData['@numpages'] || '1'); // Adjust key if needed
            }

            const adsOnPage = pageData.Ads || pageData.records || []; // Adjust key if needed
            if (adsOnPage.length > 0) {
                allAds = allAds.concat(adsOnPage);
            }

            currentPage++;

        } while (currentPage <= totalPages);

        // Simple filter to exclude Type=BANNER ads
        const filteredAds = allAds.filter(ad => ad.Type !== 'BANNER');
        
        // Clean up empty keys from each ad object
        const cleanedAds = filteredAds.map(ad => {
            const cleanedAd = {};
            for (const [key, value] of Object.entries(ad)) {
                // Check for null, undefined, empty string, empty array, empty object
                const isEmptyArray = Array.isArray(value) && value.length === 0;
                const isEmptyObject = typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
                
                if (value !== null && value !== undefined && value !== "" && !isEmptyArray && !isEmptyObject) {
                    cleanedAd[key] = value;
                }
            }
            return cleanedAd;
        });

        // Output the final cleaned and filtered ads as JSON to stdout
        process.stdout.write(JSON.stringify(cleanedAds, null, 2));

    } catch (error) {
        console.error("\n--- Script terminated due to error ---");
        console.error(error.message);
        process.exit(1); // Exit with error code if something fails
    }
}

// Run the main function
browseCatalog();
