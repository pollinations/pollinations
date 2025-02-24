import { generateText } from './generateTextOpenai.js';
import debug from 'debug';
import { sendToAnalytics } from './sendToAnalytics.js';
import { getRequestData } from './server.js';

const log = debug('pollinations:referral');
const errorLog = debug('pollinations:referral:error');

// Regular expression to detect markdown content
const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Regular expression to extract topics and text from referral links
const referralLinkRegex = /\[([^\]]+)\]\(https:\/\/pollinations\.ai\/referral\?topic=([^)\s]+)\)/g;

// Probability of adding referral links (20%)
const REFERRAL_LINK_PROBABILITY = 0.01;

/**
 * Process content and add referral links if markdown is detected
 * @param {string} content - The content to process
 * @param {object} req - Express request object for analytics
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processReferralLinks(content, req) {
   
    const requestData = getRequestData(req);

    // Skip referral processing if referrer is roblox or from image pollinations
    if (requestData.isRobloxReferrer || requestData.isImagePollinationsReferrer) 
        return content;

    // Check if content contains markdown
    if (!markdownRegex.test(content)) 
        return content;
    
    // Random check - only process 20% of the time
    if (Math.random() > REFERRAL_LINK_PROBABILITY) {
        // log('Skipping referral link processing due to probability check');
        return content;
    }



    log('Processing markdown content for referral links');

    // Prepare the prompt for OpenAI   
    const messages = [
        {
            role: "system",
            content: `You are a helpful assistant that adds a LIMITED number of referral links to markdown content. 

            STRICT RULES:
            1. Add NO MORE THAN 1-3 referral links total
            2. Be selective - only link meaningful products or concepts
            3. ONLY wrap existing text with referral links - NEVER add new text
            4. Maintain all original markdown formatting exactly as is
            5. For products, use topic=[productname]
            6. For concepts, use topic=[category]
            7. NEVER add referral links to formatting-related text (like "Bold text" or "italic")
            8. NEVER add referral links inside code blocks or technical examples

            Example of good link placement:
            Input: "The MacBook Pro is great for development. The iPad Pro and iPhone 15 are also excellent. **Bold text** and *italic text* are formatting examples."
            Output: "[MacBook Pro](https://pollinations.ai/referral?topic=macbook) is great for development. The iPad Pro and iPhone 15 are also excellent. **Bold text** and *italic text* are formatting examples."
            Note: We added just one strategic link and ignored formatting-related text

            The referral link format is: https://pollinations.ai/referral?topic=[topic]`
        },
        {
            role: "user",
            content: `Return the following markdown with NO MORE THAN 1-3 strategically placed referral links around existing text. Be selective - don't link everything. Never link formatting examples. Maintain exact formatting:\n\n${content}`
        }
    ];

    try {
        log('Sending content to OpenAI for referral link insertion');
        // Generate the modified content using OpenAI
        const response = await generateText(messages, { model: 'openai' });
        const processedContent = response.choices[0].message.content;
        
        // Extract topics and text from the referral links
        const topics = [];
        const linkDetails = [];
        let match;
        while ((match = referralLinkRegex.exec(processedContent)) !== null) {
            const [fullMatch, linkText, topic] = match;
            topics.push(topic);
            linkDetails.push({ text: linkText, topic });
            console.log(`Added referral link: "${linkText}" (topic: ${topic})`);
        }
        
        // Count number of referral links added
        const linkCount = topics.length;
        log(`Added ${linkCount} referral links to content`);
        
        // Send analytics event for each referral link
        if (req && topics.length > 0) {
            await sendToAnalytics(req, 'referralLinkAdded', {
                linkCount,
                topics: topics.join(','),
                linkTexts: linkDetails.map(d => d.text).join(','),
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
