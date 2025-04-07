import debug from 'debug';
import affiliatePrompt, { affiliatesData } from "./affiliate_prompt.js";
import { generateTextPortkey } from '../generateTextPortkey.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

/**
 * Find the most relevant affiliate for the given content using an LLM.
 *
 * @param {string} content - The output content to analyze.
 * @param {Array} messages - The input messages to analyze (optional).
 * @returns {Promise<string|null>} - The ID of the most relevant affiliate, or null if none found/suitable.
 */
export async function findRelevantAffiliate(content, messages = []) {
    // Combine the last 3 messages with the current content for context
    const lastMessages = messages.slice(-3).map(m => m.content || "").filter(Boolean);
    const combinedContent = [...lastMessages, content].join("\n");
    
    if (!combinedContent || combinedContent.trim() === "") {
        log("No content to analyze for affiliate matching");
        return null;
    }

    // Check if we should exclude NSFW content
    const shouldExcludeNSFW = !combinedContent.toLowerCase().includes("nsfw") && 
                              !combinedContent.toLowerCase().includes("adult") &&
                              !combinedContent.toLowerCase().includes("sex");

    // Filter out NSFW affiliates if needed
    const eligibleAffiliates = shouldExcludeNSFW 
        ? affiliatesData.filter(affiliate => !affiliate.nsfw)
        : affiliatesData;
    
    // If no eligible affiliates, return null
    if (eligibleAffiliates.length === 0) {
        log("No eligible affiliates available");
        return null;
    }

    try {
        // Use the markdown format for the LLM prompt
        const promptForLLM = `
Based on the following conversation content, determine which affiliate program would be most relevant to suggest.
Return ONLY the ID of the most relevant affiliate from the list below, or "none" if none are relevant.

CONVERSATION CONTENT:
${combinedContent}

AVAILABLE AFFILIATES:
${affiliatePrompt}

AFFILIATE ID:`;

        const completion = await generateTextPortkey([{ role: "user", content: promptForLLM }]);
        
        const response = completion.choices[0]?.message?.content?.trim();
        
        if (!response || response.toLowerCase() === "none") {
            log("No relevant affiliate found by LLM");
            return null;
        }

        // Extract just the affiliate ID from the response
        const affiliateIdMatch = response.match(/\b([a-zA-Z0-9]+)\b/);
        const affiliateId = affiliateIdMatch ? affiliateIdMatch[1] : null;
        
        if (!affiliateId) {
            log("Could not extract affiliate ID from LLM response");
            return null;
        }

        // Find the affiliate in our data
        const matchedAffiliate = affiliatesData.find(a => a.id === affiliateId);
        
        if (!matchedAffiliate) {
            log(`Affiliate ID ${affiliateId} not found in affiliate data`);
            return null;
        }

        log(`Found relevant affiliate: ${matchedAffiliate.name} (${affiliateId})`);
        return {
            id: affiliateId,
            name: matchedAffiliate.name,
            product: matchedAffiliate.product,
            description: matchedAffiliate.description
        };
    } catch (error) {
        errorLog(`Error finding relevant affiliate: ${error.message}`);
        return null;
    }
}

/**
 * Generates a markdown ad string for the identified affiliate provider.
 *
 * @param {string} affiliateId - The ID of the affiliate provider.
 * @returns {string|null} - A markdown string for the ad, or null if ID is invalid or ad cannot be generated.
 */
export async function generateAffiliateAd(affiliateId) {
    if (!affiliateId) {
        log("No affiliate ID provided for ad generation");
        return null;
    }

    try {
        // Find the affiliate in our data
        const affiliate = affiliatesData.find(a => a.id === affiliateId);
        
        if (!affiliate) {
            log(`Affiliate ID ${affiliateId} not found in affiliate data`);
            return null;
        }

        // Use the description if available, otherwise use the product
        let adTextSource = affiliate.description || null;
        
        // If no description, use product information
        if (!adTextSource && affiliate.product) {
            adTextSource = `Learn more about ${affiliate.product}`;
        }
        
        // If still no text, create a very generic one (less ideal)
        if (!adTextSource) {
            adTextSource = `Learn more about ${affiliate.name}`;
            log(`No specific description/product found for ${affiliateId}, using generic ad text.`);
        }

        // Create the referral link
        const referralLink = `https://pollinations.ai/referral/${affiliateId}`;
        
        // Format the ad
        const adText = `\n\n---\n${adTextSource} [Learn more](${referralLink})`;
        
        log(`Generated ad for ${affiliate.name} (${affiliateId})`);
        return adText;
    } catch (error) {
        errorLog(`Error generating affiliate ad: ${error.message}`);
        return null;
    }
}

/**
 * Extracts information about referral links in the content.
 * @param {string} content - The content to analyze for referral links.
 * @returns {Object} - Information about the referral links found.
 */
function extractReferralLinkInfo(content) {
    // Initialize result object
    const result = {
        linkCount: 0,
        linkTexts: [],
        linkTextsString: '',
        topicsOrIds: [],
        topicsOrIdsString: '',
        affiliateIds: []
    };
    
    if (!content) return result;
    
    // Regular expression to find referral links in the content
    // Updated to match the new format: https://pollinations.ai/referral/[id]
    const referralLinkRegex = /\[([^\]]+)\]\((https:\/\/pollinations\.ai\/referral\/([a-zA-Z0-9]+))[^\)]*\)/g;
    
    let match;
    while ((match = referralLinkRegex.exec(content)) !== null) {
        // Increment link count
        result.linkCount++;
        
        // Extract link text
        const linkText = match[1];
        result.linkTexts.push(linkText);
        
        // Extract affiliate ID from the URL
        const affiliateId = match[3];
        
        result.topicsOrIds.push(affiliateId);
        
        // Add affiliate ID to the list if it exists
        if (affiliateId) {
            result.affiliateIds.push(affiliateId);
        }
    }
    
    // Join arrays into strings for analytics
    result.linkTextsString = result.linkTexts.join(',');
    result.topicsOrIdsString = result.topicsOrIds.join(',');
    
    return result;
}

// Mock function might need update or removal depending on testing strategy
/**
 * Add mock referral links for testing purposes
 * @param {string} content - Content to add mock links to
 * @returns {string} - Content with mock links added
 */
function addMockReferralLinks(content) {
    // Add a mock referral link for testing
    const mockReferralLink = `\n\n---\nTest affiliate product description [Learn more](https://pollinations.ai/referral/test123)`;
    return content + mockReferralLink;
}

// Export the relevant functions
export { extractReferralLinkInfo, addMockReferralLinks };
