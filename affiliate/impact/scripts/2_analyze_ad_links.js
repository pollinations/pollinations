const axios = require('axios');
const readline = require('readline');

const POLLINATIONS_TEXT_API = 'https://text.pollinations.ai';

/**
 * Fetches analysis from Pollinations API for a given URL.
 * @param {string} urlToAnalyze - The URL of the ad landing page or tracking link.
 * @returns {Promise<object|null>} - The analysis object or null if an error occurs.
 */
async function getUrlAnalysis(urlToAnalyze) {
    if (!urlToAnalyze || typeof urlToAnalyze !== 'string') {
        console.error(`[analyze_link] Invalid URL provided for analysis: ${urlToAnalyze}`);
        return { affiliate_audience: null, affiliate_product: null };
    }

    try {
        console.error(`[analyze_link] Fetching analysis for URL: ${urlToAnalyze}`);
        
        const response = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(`YOU MUST RESPOND ONLY WITH A SIMPLE JSON OBJECT. DO NOT USE TOOL_CALLS. DO NOT USE FUNCTION_CALLS.
The JSON must have exactly these two keys:
1. "affiliate_audience": a string describing the target audience for ${urlToAnalyze}
2. "affiliate_product": a string describing the main product/service offered at ${urlToAnalyze}

Example format: {"affiliate_audience":"description here","affiliate_product":"description here"}`)}?model=searchgpt&json=true`, {
            timeout: 30000 // 30 second timeout
        });

        // Log the raw response data for debugging
        console.error(`[analyze_link] Raw API response data for ${urlToAnalyze}:`, JSON.stringify(response.data, null, 2));

        // For the text API, the response is directly in response.data
        let analysisData;
        if (typeof response.data === 'object' && response.data !== null) {
            analysisData = response.data;
        } else if (typeof response.data === 'string') {
            try {
                analysisData = JSON.parse(response.data);
            } catch (parseError) {
                console.error(`[analyze_link] Error parsing JSON string response for ${urlToAnalyze}: ${parseError.message}. Raw data:`, response.data);
                return { affiliate_audience: null, affiliate_product: null };
            }
        } else {
            console.error(`[analyze_link] Unexpected response data type (${typeof response.data}) for ${urlToAnalyze}. Raw data:`, response.data);
            return { affiliate_audience: null, affiliate_product: null };
        }

        // Check if the necessary keys exist in the potentially parsed data
        if (analysisData && 
            typeof analysisData === 'object' && 
            (analysisData.affiliate_audience !== undefined || analysisData.affiliate_product !== undefined)) {
            
            console.error(`[analyze_link] Successfully extracted analysis for ${urlToAnalyze}`);
            return {
                affiliate_audience: analysisData.affiliate_audience || null,
                affiliate_product: analysisData.affiliate_product || null
            };
        } else {
            console.error(`[analyze_link] Response missing expected keys for ${urlToAnalyze}. Received:`, JSON.stringify(analysisData, null, 2));
            
            // Try to extract data from response if it doesn't have our expected keys directly
            // but has content we might be able to parse as JSON
            if (typeof analysisData === 'string' && analysisData.includes('{') && analysisData.includes('}')) {
                try {
                    // Try to extract JSON from the string if it contains JSON-like content
                    const jsonStart = analysisData.indexOf('{');
                    const jsonEnd = analysisData.lastIndexOf('}') + 1;
                    if (jsonStart >= 0 && jsonEnd > jsonStart) {
                        const jsonStr = analysisData.substring(jsonStart, jsonEnd);
                        const extractedJson = JSON.parse(jsonStr);
                        if (extractedJson.affiliate_audience || extractedJson.affiliate_product) {
                            console.error(`[analyze_link] Successfully extracted embedded JSON data for ${urlToAnalyze}`);
                            return {
                                affiliate_audience: extractedJson.affiliate_audience || null,
                                affiliate_product: extractedJson.affiliate_product || null
                            };
                        }
                    }
                } catch (e) {
                    console.error(`[analyze_link] Failed to extract embedded JSON: ${e.message}`);
                }
            }
            
            return { affiliate_audience: null, affiliate_product: null };
        }
    } catch (error) {
        // Log details if the axios request itself fails
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error(`[analyze_link] API Error for ${urlToAnalyze}: Status ${error.response.status}, Data:`, 
                JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            // The request was made but no response was received
            console.error(`[analyze_link] Network Error for ${urlToAnalyze}: No response received`);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error(`[analyze_link] Request Setup Error for ${urlToAnalyze}:`, error.message);
        }
        return { affiliate_audience: null, affiliate_product: null };
    }
}

/**
 * Reads JSON data from stdin, processes each ad, and adds analysis.
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
            console.error('[analyze_link] Error parsing JSON input from stdin:', e.message);
            process.exit(1);
        }

        // Log the number of ads received
        console.error(`[analyze_link] Received ${ads.length} ads to process sequentially.`);
        if (ads.length === 0) {
            console.error("[analyze_link] No ads received, exiting.");
            process.stdout.write(JSON.stringify([])); // Output empty array
            return;
        }

        // Process ads sequentially to respect rate limits
        const results = [];
        console.error(`[analyze_link] Starting sequential analysis for ${ads.length} ads...`);
        let count = 0;

        for (const ad of ads) {
            count++;
            console.error(`[analyze_link] Processing ad ${count}/${ads.length} (ID: ${ad.Id || 'N/A'})`);
            
            try {
                // Prioritize LandingPageUrl, fallback to TrackingLink
                const url = ad.LandingPageUrl || ad.TrackingLink;
                // analysisResult will be an object { affiliate_audience: ..., affiliate_product: ... } or null
                const analysisResult = await getUrlAnalysis(url);

                // Start with the original ad data
                const finalAd = { ...ad };

                // Remove the old nested key if it exists (just in case)
                delete finalAd.pollinations_analysis;

                // Add the new simplified fields, defaulting to null if analysis failed
                finalAd.affiliate_audience = analysisResult?.affiliate_audience || null;
                finalAd.affiliate_product = analysisResult?.affiliate_product || null;

                results.push(finalAd);

            } catch (loopError) {
                console.error(`[analyze_link] Error processing ad ID ${ad.Id || 'N/A'}: ${loopError.message}`);
                // Optionally push the ad with nulls even if analysis fails catastrophically
                const errorAd = { 
                    ...ad,
                    affiliate_audience: null,
                    affiliate_product: null,
                    processing_error: loopError.message
                };
                delete errorAd.pollinations_analysis; // Ensure old key is removed
                results.push(errorAd);
            }
            
            // Add a 3-second delay between calls to respect rate limits
            if (count < ads.length) {
                console.error(`[analyze_link] Waiting 3 seconds before next call...`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Actual 3-second delay
            }
        }

        console.error(`[analyze_link] Finished sequential analysis.`);
        // Output the final combined JSON to stdout
        process.stdout.write(JSON.stringify(results, null, 2));

    });
}

processInput(); 