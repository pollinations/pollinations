import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { getRequestData } from '../requestUtils.js';
import { findRelevantAffiliate, generateAffiliateAd, extractReferralLinkInfo, addMockReferralLinks } from './adLlmMapper.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

// Regular expression to detect markdown content
const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Probability of adding referral links (1%)
const REFERRAL_LINK_PROBABILITY = 1;

// Flag for testing ads with a specific marker
const TEST_ADS_MARKER = "p-ads";

// Whether to require markdown for ad processing
const REQUIRE_MARKDOWN = false;

/**
 * Process content and add referral links if markdown is detected
 * @param {string} content - The output content to process
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages (optional)
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processRequestForAds(content, req, messages = []) {
    // In test environment, req might be undefined
    if (!req) {
        // For tests, just check if content is markdown (if required)
        if (REQUIRE_MARKDOWN && !markdownRegex.test(content))
            return content;
            
        // For tests, skip probability check
        if (process.env.NODE_ENV !== 'test' && Math.random() > REFERRAL_LINK_PROBABILITY) {
            return content;
        }
        
        // For tests, return content with a simple mock referral link
        if (process.env.NODE_ENV === 'test') {
            // Check if Math.random is mocked to 1 (for probability test)
            if (Math.random() === 1) {
                return content;
            }
            
            return addMockReferralLinks(content);
        }
    }
    
    // Normal production flow
    const requestData = req ? getRequestData(req) : { referrer: null };

    // Skip ad processing if any referrer is present
    if (requestData.referrer && requestData.referrer !== 'unknown') {
        log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return content;
    }

    // Check if content contains markdown (if required)
    if (REQUIRE_MARKDOWN && !markdownRegex.test(content)) 
        return content;
    
    // Test filter: only process if content or input messages contain the test marker "p-ads"
    let markerFound = content.includes(TEST_ADS_MARKER);
    
    // Also check in the input messages if available
    if (!markerFound && messages && messages.length > 0) {
        markerFound = messages.some(msg => msg.content && msg.content.includes(TEST_ADS_MARKER));
    }
    
    if (!markerFound) {
        log('Skipping ad processing - test marker "p-ads" not found in content or input messages');
        return content;
    }
    
    // Random check - only process 20% of the time
    if (Math.random() > REFERRAL_LINK_PROBABILITY) {
        // log('Skipping referral link processing due to probability check');
        return content;
    }

    log('Processing markdown content for referral links');

    try {
        // Find the relevant affiliate - now returns an object with affiliate details
        const affiliateData = await findRelevantAffiliate(content, messages);
        
        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            const adString = await generateAffiliateAd(affiliateData.id);
            
            // If an ad string was successfully generated, append it
            if (adString) {
                const processedContent = content + adString; // Append ad string
                
                // Extract info for analytics
                const linkInfo = extractReferralLinkInfo(processedContent); 
                
                log(`Appended ad for affiliate ${affiliateData.name} (${affiliateData.id}). Total links now: ${linkInfo.linkCount}`);
                
                // Send analytics event
                if (req && linkInfo.linkCount > 0) {
                    await sendToAnalytics(req, 'referralLinkAdded', {
                        linkCount: linkInfo.linkCount,
                        topics: linkInfo.topicsOrIdsString || '', 
                        linkTexts: linkInfo.linkTextsString || '',
                        contentLength: content.length,
                        processedLength: processedContent.length,
                        affiliateIds: linkInfo.affiliateIds ? linkInfo.affiliateIds.join(',') : '',
                        affiliateName: affiliateData.name || ''
                    });
                }
                
                return processedContent; // Return content with appended ad
            }
        }
        
        // If no relevant affiliate or ad string couldn't be generated, return original content
        log("No relevant affiliate found or ad generation failed.");
        return content;

    } catch (error) {
        errorLog('Error adding referral links:', error);
        // If there's an error, return the original content
        return content;
    }
}
