import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import affiliatePrompt from './affiliate_prompt.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

/**
 * Find the most relevant affiliate for the given content using an LLM.
 *
 * @param {string} content - The output content to analyze.
 * @param {Array} messages - The input messages to analyze (optional).
 * @returns {Promise<string|null>} - The ID of the most relevant affiliate, or null if none found/suitable.
 */
async function findRelevantAffiliate(content, messages = []) {
    log('Finding relevant affiliate for content and messages');

    try {
        // Combine input messages and output content for analysis
        let combinedContent = content;
        
        // If we have input messages, add them to the combined content
        if (messages && messages.length > 0) {
            // Get only the last 3 messages for context
            const recentMessages = messages.slice(-3);
            
            // Extract the text from each message, truncate if needed, and add to the combined content
            const messageTexts = recentMessages.map(msg => {
                const role = msg.role || 'unknown';
                let content = msg.content || '';
                
                // Truncate content if it's too long (max 250 chars)
                if (content.length > 250) {
                    content = content.substring(0, 250) + '...';
                }
                
                return `${role}: ${content}`;
            }).join('\n\n');
            
            combinedContent = `${messageTexts}\n\n${content}`;
            log('Combined recent input messages and output content for affiliate analysis');
        }

        // Prepare the prompt for the LLM to find the most relevant affiliate
        const promptMessages = [
            {
                role: "system",
                content: `You are a helpful assistant that analyzes content and determines the most relevant affiliate program from a list.

                Here is the list of available affiliate programs:
                ${affiliatePrompt}

                Your task is to:
                1. Analyze the content provided by the user.
                2. Determine which affiliate program is MOST relevant to the content.
                3. Return ONLY the ID of the most relevant affiliate program (e.g., '1422856', '432264', 'lovemy', 'kofi').
                4. If no affiliate program is clearly relevant or you are unsure, return "none".
                5. Be conservative: if multiple seem potentially relevant but none stand out strongly, return "none".

                Return ONLY the ID value or "none", nothing else - no explanations, no additional text.`
            },
            {
                role: "user",
                content: `Analyze this content and return the ID of the most relevant affiliate program:\n\n${combinedContent}`
            }
        ];

        // Generate the affiliate ID using an LLM (Portkey)
        const response = await generateTextPortkey(promptMessages, { model: 'openai' }); // Assuming OpenAI via Portkey
        const affiliateId = response.choices[0].message.content.trim();

        // If the response is "none" or empty, return null
        if (!affiliateId || affiliateId.toLowerCase() === 'none') {
            log('No relevant affiliate found by LLM');
            return null;
        }

        // Basic validation: Check if the returned ID actually exists in the prompt data
        const idPattern = new RegExp(`- ID: ${affiliateId}\\b`);
        if (!idPattern.test(affiliatePrompt)) {
            log(`LLM returned an invalid or unknown affiliate ID: ${affiliateId}`);
            return null;
        }


        log(`LLM selected affiliate ID: ${affiliateId}`);
        return affiliateId;
    } catch (error) {
        errorLog('Error finding relevant affiliate:', error);
        return null;
    }
}


/**
 * Generates a markdown ad string for the identified affiliate provider.
 *
 * @param {string} affiliateId - The ID of the affiliate provider.
 * @returns {string|null} - A markdown string for the ad, or null if ID is invalid or ad cannot be generated.
 */
function generateAffiliateAd(affiliateId) {
    log("Generating referral ad string for affiliate:", affiliateId);
    if (!affiliateId) {
        log("No affiliate ID provided for ad generation.");
        return null;
    }

    // Regex to find the section for the given affiliate ID
    // It looks for "- ID: [affiliateId]" and captures everything until the next "##" or end of string
    const affiliateSectionRegex = new RegExp(`- ID: ${affiliateId}\\b([\\s\\S]*?)(?=\\n##|$)`, "s");
    const match = affiliatePrompt.match(affiliateSectionRegex);

    if (!match || !match[1]) {
        errorLog("Could not find section details for affiliate ID:", affiliateId, "in affiliate_prompt.js");
        return null;
    }

    const affiliateDetails = match[1]; // Content of the specific affiliate's section

    // Extract a relevant text snippet for the ad. Priority: Description, Product, then generic.
    let adTextSource = '';
    const descriptionMatch = affiliateDetails.match(/- Description: (.*?)\n/);
    const productMatch = affiliateDetails.match(/- Product: (.*?)\n/);

    if (descriptionMatch && descriptionMatch[1].trim()) {
        adTextSource = descriptionMatch[1].trim();
    } else if (productMatch && productMatch[1].trim()) {
        adTextSource = productMatch[1].trim(); // Use product name/description if Description field is missing
    }

    // If still no text, create a very generic one (less ideal)
    if (!adTextSource) {
         // Attempt to get the Affiliate name from the preceding "##" line as a last resort
        const nameRegex = new RegExp(`## (.*?)\\n[\\s\\S]*- ID: ${affiliateId}\\b`);
        const nameMatch = affiliatePrompt.match(nameRegex);
        const affiliateName = nameMatch ? nameMatch[1].trim() : `Affiliate ${affiliateId}`;
        adTextSource = `Learn more about ${affiliateName}`;
        log(`No specific description/product found for ${affiliateId}, using generic ad text.`);
    }


    // --- Ad Text Truncation ---
    const MAX_AD_LENGTH = 80;
    let adText = adTextSource;
     if (adText.length > MAX_AD_LENGTH) {
        // Try to find a sentence break before the max length
        let lastSentenceBreak = adText.lastIndexOf('.', MAX_AD_LENGTH);
        // Only break if it's a reasonable length (e.g., more than half the max length)
        if (lastSentenceBreak > MAX_AD_LENGTH / 2) {
             adText = adText.substring(0, lastSentenceBreak + 1);
        } else {
             // Otherwise, just truncate and add ellipsis
             adText = adText.substring(0, MAX_AD_LENGTH) + "...";
        }
    }
    // --- End Truncation ---


    // Construct the redirect URL
    const url = `https://pollinations.ai/redirect/${affiliateId}`;

    // Construct the final markdown ad string
    const adString = `\n\n---\n[${adText}](${url})\n`;

    log("Generated ad string:", adString);
    return adString;
}


// Keep the extraction function as it might be useful for analytics or other purposes
/**
 * Extract referral link information from processed content (less relevant now but kept)
 * @param {string} processedContent - Content potentially containing referral links
 * @returns {object} - Information about extracted links
 */
export function extractReferralLinkInfo(processedContent) {
    // This regex might need adjustment if the link format changes
    const referralLinkRegex = /\[([^\]]+)\]\(https:\/\/pollinations\.ai\/(?:referral\?topic=|redirect\/)([^)&\s]+)(?:&id=([^)&\s]+))?\)/g;
    const topicsOrIds = []; // Can now be topics or IDs
    const linkDetails = [];
    const affiliateIds = new Set(); // Explicit affiliate IDs if present
    let match;

    while ((match = referralLinkRegex.exec(processedContent)) !== null) {
        const [fullMatch, linkText, topicOrId, explicitAffiliateId] = match;
        topicsOrIds.push(topicOrId);

        const linkDetail = {
            text: linkText,
            topicOrId: topicOrId
        };

        // If the link uses the old format with &id=
        if (explicitAffiliateId) {
            linkDetail.affiliateId = explicitAffiliateId;
            affiliateIds.add(explicitAffiliateId);
        }
         // If the link uses the new redirect format, the topicOrId is the affiliateId
        else if (processedContent.includes('/redirect/')) {
             linkDetail.affiliateId = topicOrId; // The ID is part of the path
             affiliateIds.add(topicOrId);
        }


        linkDetails.push(linkDetail);
        // log(`Found link: "${linkText}" (Topic/ID: ${topicOrId}${linkDetail.affiliateId ? `, Affiliate: ${linkDetail.affiliateId}` : ''})`);
    }

    return {
        linkCount: topicsOrIds.length,
        topicsOrIds, // Renamed from 'topics'
        linkDetails,
        topicsOrIdsString: topicsOrIds.join(','), // Renamed
        linkTextsString: linkDetails.map(d => d.text).join(','),
        affiliateIds: Array.from(affiliateIds)
    };
}

// Mock function might need update or removal depending on testing strategy
/**
 * Helper function for test environments to add mock referral links (APPENDS NOW)
 * @param {string} content - Content to process
 * @returns {string} - Content with a mock appended referral link
 */
export function addMockReferralLinks(content) {
    // Appends a simple mock ad instead of inserting
    const mockAd = "\n\n---\n[Mock Product Ad](https://pollinations.ai/redirect/mock_affiliate)\n";
    return content + mockAd;
}

// Export the relevant functions
export { findRelevantAffiliate, generateAffiliateAd };
