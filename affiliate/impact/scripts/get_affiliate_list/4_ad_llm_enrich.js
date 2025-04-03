require('dotenv').config({ path: '../../../.env' });
const axios = require("axios");
const readline = require("readline");

const POLLINATIONS_TEXT_API = "https://text.pollinations.ai";
const MAX_RETRIES = 3; // Maximum number of retry attempts for API calls
const RETRY_DELAY = 3000; // 4 seconds delay between retries
const CALL_DELAY = 1000; // 1 second delay between API calls (reduced from 3s)
const REFERRER = process.env.POLLINATIONS_REFERRER || 'pollinations'; // Get referrer from .env or use default

/**
 * Sleeps for the specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches analysis from Pollinations API for a given ad.
 * @param {object} ad - The full ad object to analyze.
 * @returns {Promise<object|null>} - The analysis object or null if an error occurs.
 */
async function getAdAnalysis(ad) {
  // First extract relevant information from the ad
  const url = ad.LandingPageUrl || ad.TrackingLink || '';
  
  // If there's no URL to analyze, return empty analysis
  if (!url || typeof url !== "string") {
    console.error(`[analyze_link] Invalid URL provided for analysis: ${url}`);
    return {
      AffiliateAudience: null,
      AffiliateProduct: null,
      AffiliateCategory: null,
    };
  }

  // Extract other useful context from the ad
  const name = ad.Name || '';
  const description = ad.Description || '';
  const advertiser = ad.AdvertiserName || '';
  const labels = ad.Labels || '';
  const type = ad.Type || '';
  const isCustom = ad.isCustomAffiliate || false;
  const campaignDesc = ad.CampaignDescription || '';

  // Create an enhanced prompt that includes all relevant ad information
  const prompt = `YOU MUST RESPOND ONLY WITH A SIMPLE JSON OBJECT. DO NOT USE TOOL_CALLS. DO NOT USE FUNCTION_CALLS.
The JSON must have exactly these three keys:
1. "affiliate_audience": a string describing the target audience for this product/service
2. "affiliate_product": a string describing the main product/service offered
3. "affiliate_category": an array with relevant categories (choose one or multiple from the following categories: "Accessories & Peripherals", "Accessories & Services", "Accommodations", "Apparel & Accessories", "Apparel", "Shoes & Accessories", "Apps", "Art & Craft Supplies", "Art & Photography", "Auctions", "Automobiles & Auto Services", "B2B", "Baby & Kids", "Home", "Baby Essentials", "Bags & Accessories", "Bath & Beauty", "Bed & Bath", "Books & Magazines", "Books & Newsstand", "CDN Service", "Career", "Charitable Causes", "Clothing & Accessories", "Collectibles & Hobbies", "College", "Computers", "Consumer Electronics", "Cosmetics & Skin Care", "Creative Digital Assets", "Credit Cards", "Reporting & Repair", "Diet & Nutrition", "Disaster Relief", "Educational", "Entertainment & Activities", "Fall", "First Aid & pharmacy", "Flowers", "Food & Beverages", "Food & Drink", "Food & Gifts", "Fragrance", "Furniture & Home Decor", "Games", "Games/Toys", "Gaming", "Gifts & Services", "Gifts & Stationery", "Gourmet", "Handmade Goods", "Health & Beauty", "Home & Garden", "Home Improvement", "Home", "Pet & Garden", "Household Essentials & Services", "Images", "Insurance", "Internet Service Provider", "Jewelry & Watches", "Kitchen & Dining", "Learning", "Legal", "Loans & Financial Services", "Luxury", "Mens Apparel", "Mobile Services & Telecommunications", "Movie & TV", "Movies & Music", "Online Dating", "Outdoors & Recreation", "Parts & Accessories", "Party & Party Supplies", "Patio & Garden", "Pet Services", "Pet Supplies", "Real Estate", "Recreational Vehicles", "Romance", "Server Hosting", "Sexual Wellness & Adult", "Shoes", "Shopping", "Software", "Spa & Personal Grooming", "Specialty Sizes", "Sports & Exercise Equipment", "Sports & Outdoor", "Sports Apparel & Accessories", "Spring", "Summer", "Supplies & Furniture", "Tax", "Templates", "Fonts", "Add-ons & more", "Textbooks & Supplies", "Themes", "Code", "Graphics", "Video & more", "Tickets & Shows", "Transportation", "Vacations", "Vision", "Website Hosting", "Wine & Spirits", "Winter", "Womens Apparel")

ANALYZE THIS AD:
Name: ${name}
Description: ${description}
Advertiser: ${advertiser}
URL: ${url}
Labels: ${labels}
Type: ${type}
Custom Affiliate: ${isCustom}
Campaign Description: ${campaignDesc}

PAY CLOSE ATTENTION TO THE LABELS - they often contain important category information.
If the labels contain "nsfw", "adult", or similar terms, make sure to include "Sexual Wellness & Adult" in the categories.

Example format: {"affiliate_audience":"description here","affiliate_product":"description here","affiliate_category":["category 1 here","category 2 here"]}`;

  // Implement retry logic
  let retries = 0;
  
  while (retries <= MAX_RETRIES) {
    try {
      console.error(`[analyze_link] Fetching analysis for ad: ${ad.Id || 'unknown'} (${name})${retries > 0 ? ` [Retry ${retries}/${MAX_RETRIES}]` : ''}`);
      
      const response = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=searchgpt&json=true&referrer=${REFERRER}`,
        {
          timeout: 30000, // 30 second timeout
        }
      );

      // Log the raw response data for debugging
      console.error(
        `[analyze_link] Raw API response data for ${ad.Id}:`,
        JSON.stringify(response.data, null, 2)
      );

      // For the text API, the response is directly in response.data
      let analysisData;
      if (typeof response.data === "object" && response.data !== null) {
        analysisData = response.data;
      } else if (typeof response.data === "string") {
        try {
          analysisData = JSON.parse(response.data);
        } catch (parseError) {
          console.error(
            `[analyze_link] Error parsing JSON string response for ${ad.Id}: ${parseError.message}. Raw data:`,
            response.data
          );
          return {
            AffiliateAudience: null,
            AffiliateProduct: null,
            AffiliateCategory: null,
          };
        }
      } else {
        console.error(
          `[analyze_link] Unexpected response data type (${typeof response.data}) for ${ad.Id}. Raw data:`,
          response.data
        );
        return {
          AffiliateAudience: null,
          AffiliateProduct: null,
          AffiliateCategory: null,
        };
      }

      // Check if the necessary keys exist in the potentially parsed data
      if (
        analysisData &&
        typeof analysisData === "object" &&
        (analysisData.affiliate_audience !== undefined ||
          analysisData.affiliate_product !== undefined ||
          analysisData.affiliate_category !== undefined)
      ) {
        console.error(
          `[analyze_link] Successfully extracted analysis for ${ad.Id}`
        );
        return {
          AffiliateAudience: analysisData.affiliate_audience || null,
          AffiliateProduct: analysisData.affiliate_product || null,
          AffiliateCategory: analysisData.affiliate_category || null,
        };
      } else {
        console.error(
          `[analyze_link] Response missing expected keys for ${ad.Id}. Received:`,
          JSON.stringify(analysisData, null, 2)
        );

        // Try to extract data from response if it doesn't have our expected keys directly
        // but has content we might be able to parse as JSON
        if (
          typeof analysisData === "string" &&
          analysisData.includes("{") &&
          analysisData.includes("}")
        ) {
          try {
            // Try to extract JSON from the string if it contains JSON-like content
            const jsonStart = analysisData.indexOf("{");
            const jsonEnd = analysisData.lastIndexOf("}") + 1;
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = analysisData.substring(jsonStart, jsonEnd);
              const extractedJson = JSON.parse(jsonStr);
              if (
                extractedJson.affiliate_audience ||
                extractedJson.affiliate_product ||
                extractedJson.affiliate_category
              ) {
                console.error(
                  `[analyze_link] Successfully extracted embedded JSON data for ${ad.Id}`
                );
                return {
                  AffiliateAudience: extractedJson.affiliate_audience || null,
                  AffiliateProduct: extractedJson.affiliate_product || null,
                  AffiliateCategory: extractedJson.affiliate_category || null,
                };
              }
            }
          } catch (e) {
            console.error(
              `[analyze_link] Failed to extract embedded JSON: ${e.message}`
            );
          }
        }

        return {
          AffiliateAudience: null,
          AffiliateProduct: null,
          AffiliateCategory: null,
        };
      }
    } catch (error) {
      // Log details if the axios request itself fails
      if (error.response) {
        // Check if this is a 502 or similar error that might be temporary
        const isRetryableError = 
          error.response.status === 502 || 
          error.response.status === 503 || 
          error.response.status === 504;
        
        if (isRetryableError && retries < MAX_RETRIES) {
          retries++;
          console.error(
            `[analyze_link] Retryable error for ${ad.Id}: Status ${error.response.status}. Waiting ${RETRY_DELAY/1000}s before retry ${retries}/${MAX_RETRIES}...`
          );
          await sleep(RETRY_DELAY);
          continue; // Try again
        }
        
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(
          `[analyze_link] API Error for ${ad.Id}: Status ${error.response.status}, Data:`,
          typeof error.response.data === 'object' ? 
            JSON.stringify(error.response.data, null, 2) : 
            error.response.data
        );
      } else if (error.request) {
        // Network errors may be temporary, so retry those too
        if (retries < MAX_RETRIES) {
          retries++;
          console.error(
            `[analyze_link] Network error for ${ad.Id}. Waiting ${RETRY_DELAY/1000}s before retry ${retries}/${MAX_RETRIES}...`
          );
          await sleep(RETRY_DELAY);
          continue; // Try again
        }
        
        // The request was made but no response was received
        console.error(
          `[analyze_link] Network Error for ${ad.Id}: No response received`
        );
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error(
          `[analyze_link] Request Setup Error for ${ad.Id}:`,
          error.message
        );
      }
      
      // If we've reached maximum retries or it's not a retryable error, return null values
      if (retries >= MAX_RETRIES) {
        console.error(`[analyze_link] Maximum retries (${MAX_RETRIES}) reached for ${ad.Id}. Giving up.`);
      }
      
      return {
        AffiliateAudience: null,
        AffiliateProduct: null,
        AffiliateCategory: null,
      };
    }
  }
}

/**
 * Reads JSON data from stdin, processes each ad, and adds analysis.
 */
async function processInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let inputJson = "";

  rl.on("line", (line) => {
    inputJson += line;
  });

  rl.on("close", async () => {
    let ads = [];
    try {
      ads = JSON.parse(inputJson);
      if (!Array.isArray(ads)) {
        throw new Error("Input is not a JSON array.");
      }
    } catch (e) {
      console.error(
        "[analyze_link] Error parsing JSON input from stdin:",
        e.message
      );
      process.exit(1);
    }

    // Log the number of ads received
    console.error(
      `[analyze_link] Received ${ads.length} ads to process sequentially.`
    );
    if (ads.length === 0) {
      console.error("[analyze_link] No ads received, exiting.");
      process.stdout.write(JSON.stringify([])); // Output empty array
      return;
    }

    // Process ads sequentially to respect rate limits
    const results = [];
    console.error(
      `[analyze_link] Starting sequential analysis for ${ads.length} ads...`
    );
    let count = 0;

    for (const ad of ads) {
      count++;
      console.error(
        `[analyze_link] Processing ad ${count}/${ads.length} (ID: ${
          ad.Id || "N/A"
        })`
      );

      try {
        // Get LLM analysis for the full ad object, not just the URL
        const analysisResult = await getAdAnalysis(ad);

        // Start with the original ad data (preserve ALL fields)
        const finalAd = { ...ad };

        // ADD the new LLM-generated fields, keeping any existing values if LLM returns null
        finalAd.AffiliateAudience = analysisResult?.AffiliateAudience || finalAd.AffiliateAudience || finalAd.affiliate_audience || null;
        finalAd.AffiliateProduct = analysisResult?.AffiliateProduct || finalAd.AffiliateProduct || finalAd.affiliate_product || null;
        finalAd.AffiliateCategory = analysisResult?.AffiliateCategory || finalAd.AffiliateCategory || finalAd.affiliate_category || null;

        // Remove the old snake_case keys if they exist
        delete finalAd.affiliate_audience;
        delete finalAd.affiliate_product;
        delete finalAd.affiliate_category;
        
        // Remove the old nested key if it exists (just for cleanup)
        delete finalAd.pollinations_analysis;

        results.push(finalAd);
      } catch (loopError) {
        console.error(
          `[analyze_link] Error processing ad ID ${ad.Id || "N/A"}: ${
            loopError.message
          }`
        );
        // Simply push the original ad unchanged if analysis fails
        // This preserves all original data, but we should still convert field names
        const finalAd = { ...ad };
        
        // Convert existing snake_case fields to PascalCase if they exist
        if (finalAd.affiliate_audience) {
          finalAd.AffiliateAudience = finalAd.affiliate_audience;
          delete finalAd.affiliate_audience;
        }
        
        if (finalAd.affiliate_product) {
          finalAd.AffiliateProduct = finalAd.affiliate_product;
          delete finalAd.affiliate_product;
        }
        
        if (finalAd.affiliate_category) {
          finalAd.AffiliateCategory = finalAd.affiliate_category;
          delete finalAd.affiliate_category;
        }
        
        results.push(finalAd);
      }

      // Add a 1-second delay between calls to respect rate limits
      if (count < ads.length) {
        console.error(`[analyze_link] Waiting 1 second before next call...`);
        await new Promise((resolve) => setTimeout(resolve, CALL_DELAY)); // Actual 1-second delay
      }
    }

    console.error(`[analyze_link] Finished sequential analysis.`);
    // Output the final combined JSON to stdout
    process.stdout.write(JSON.stringify(results, null, 2));
  });
}

processInput();
