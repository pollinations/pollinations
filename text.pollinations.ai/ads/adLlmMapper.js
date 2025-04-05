import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

/**
 * Generate referral links using an LLM
 * @param {string} content - The content to process
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function generateReferralLinks(content) {
    log('Sending content to OpenAI for referral link insertion');
    
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
        // Generate the modified content using OpenAI
        const response = await generateTextPortkey(messages, { model: 'openai' });
        return response.choices[0].message.content;
    } catch (error) {
        errorLog('Error adding referral links:', error);
        // If there's an error, return the original content
        return content;
    }
}

/**
 * Extract referral link information from processed content
 * @param {string} processedContent - Content with referral links 
 * @returns {object} - Information about extracted links
 */
export function extractReferralLinkInfo(processedContent) {
    const referralLinkRegex = /\[([^\]]+)\]\(https:\/\/pollinations\.ai\/referral\?topic=([^)\s]+)\)/g;
    const topics = [];
    const linkDetails = [];
    let match;
    
    while ((match = referralLinkRegex.exec(processedContent)) !== null) {
        const [fullMatch, linkText, topic] = match;
        topics.push(topic);
        linkDetails.push({ text: linkText, topic });
        console.log(`Added referral link: "${linkText}" (topic: ${topic})`);
    }
    
    return {
        linkCount: topics.length,
        topics,
        linkDetails,
        topicsString: topics.join(','),
        linkTextsString: linkDetails.map(d => d.text).join(',')
    };
}

/**
 * Helper function for test environments to add mock referral links
 * @param {string} content - Content to process
 * @returns {string} - Content with mock referral links
 */
export function addMockReferralLinks(content) {
    // Simple regex to find product names (capitalized words) but not at the start of lines
    // This avoids replacing markdown headers
    const lines = content.split('\n');
    let modifiedContent = '';
    let count = 0;
    
    for (const line of lines) {
        // Skip markdown headers, code blocks, and other formatting
        if (line.startsWith('#') || line.startsWith('```') ||
            line.startsWith('>') || line.startsWith('-') ||
            line.startsWith('*') || /^\d+\./.test(line)) {
            modifiedContent += line + '\n';
            continue;
        }
        
        // For regular text lines, look for capitalized words to replace
        let modifiedLine = line;
        const productRegex = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
        let match;
        
        // Reset regex lastIndex
        productRegex.lastIndex = 0;
        
        // Add up to 3 referral links
        while ((match = productRegex.exec(line)) !== null && count < 3) {
            const product = match[0];
            const topic = product.toLowerCase().replace(/\s/g, '-');
            const link = `[${product}](https://pollinations.ai/referral?topic=${topic})`;
            
            // Replace only this occurrence
            const before = modifiedLine.substring(0, match.index);
            const after = modifiedLine.substring(match.index + product.length);
            modifiedLine = before + link + after;
            
            count++;
            
            // Adjust regex to continue from after the replacement
            productRegex.lastIndex = match.index + link.length;
        }
        
        modifiedContent += modifiedLine + '\n';
    }
    
    return modifiedContent.trim();
}
