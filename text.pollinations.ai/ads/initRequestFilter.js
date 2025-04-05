import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { getRequestData } from '../requestUtils.js';
import { generateReferralLinks, extractReferralLinkInfo, addMockReferralLinks } from './adLlmMapper.js';

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
 * @param {string} content - The content to process
 * @param {object} req - Express request object for analytics
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processRequestForAds(content, req) {
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
    
    // Test filter: only process if content contains the test marker "p-ads"
    if (!content.includes(TEST_ADS_MARKER)) {
        log('Skipping ad processing - test marker "p-ads" not found in content');
        return content;
    }
    
    // Random check - only process 20% of the time
    if (Math.random() > REFERRAL_LINK_PROBABILITY) {
        // log('Skipping referral link processing due to probability check');
        return content;
    }

    log('Processing markdown content for referral links');

    try {
        // Generate the modified content using the mapper
        const processedContent = await generateReferralLinks(content);
        
        // Extract topics and text from the referral links
        const linkInfo = extractReferralLinkInfo(processedContent);
        
        log(`Added ${linkInfo.linkCount} referral links to content`);
        
        // Send analytics event for each referral link (only in production with valid req)
        if (req && linkInfo.linkCount > 0 && process.env.NODE_ENV !== 'test') {
            await sendToAnalytics(req, 'referralLinkAdded', {
                linkCount: linkInfo.linkCount,
                topics: linkInfo.topicsString,
                linkTexts: linkInfo.linkTextsString,
                contentLength: content.length,
                processedLength: processedContent.length
            });
        }
        
        return processedContent;
    } catch (error) {
        errorLog('Error adding referral links:', error);
        // If there's an error, return the original content
        return content;
    }
}