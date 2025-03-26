import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { getRequestData } from '../requestUtils.js';
import { nsfwKeywords } from './nsfwKeywords.js';

const log = debug('pollinations:referral:nsfw');
const errorLog = debug('pollinations:referral:nsfw:error');

// Probability of adding NSFW referral links (60%)
const NSFW_REFERRAL_LINK_PROBABILITY = 1;

// Available NSFW referral links
const REFERRAL_LINKS = {
  lovemy: {
    id: 'lovemy',
    url: 'https://lovemy.ai/?linkId=lp_060145&sourceId=pollinations&tenantId=lovemyai',
    cta: 'Create your intimate AI companion on LoveMy.ai',
    phrase: 'Looking for a more personal connection?'
  },
  hentai: {
    id: 'hentai',
    url: 'https://aihentaichat.com/?linkId=lp_617069&sourceId=pollinations&tenantId=lovemyai',
    cta: 'Explore uncensored AI chat on AIHentaiChat.com',
    phrase: 'Want to explore without limits?'
  }
};

/**
 * Quick first-pass detection of NSFW content
 * @param {string|object} input - Text or object to analyze
 * @returns {boolean} - Whether NSFW content was detected
 */
function detectNSFWContent(input) {
  
  // this is just for testing our API live
  // return (input?.includes('p0rn0'));
  
  const textToAnalyze = typeof input === 'string' ? 
    input.toLowerCase() : 
    JSON.stringify(input).toLowerCase();
    
  return nsfwKeywords.some(keyword => textToAnalyze.includes(keyword));
}

/**
 * Format a referral link based on content type
 * @param {string} linkId - ID of the link to use
 * @param {boolean} isMarkdown - Whether to use markdown formatting
 * @returns {string} - Formatted referral link
 */
function formatReferralLink(linkId, isMarkdown) {
  const link = REFERRAL_LINKS[linkId];
  if (!link) return '';

  if (isMarkdown) {
    return `

---
${link.phrase} [**${link.cta}**](${link.url})`;
  } else {
    return `\n\n----\n${link.cta}: ${link.url}`;
  }
}

/**
 * Get a random link identifier
 * @returns {string} - Either 'lovemy' or 'hentai'
 */
function getRandomLinkId() {
  return Math.random() < 0.5 ? 'lovemy' : 'hentai';
}

/**
 * Extract the link identifier from the LLM response
 * @param {string} response - The LLM response text
 * @returns {string|null} - The link identifier or null if none found
 */
function extractLinkIdentifier(response) {
  if (!response) {
    log('Received empty/undefined response from LLM');
    return null;
  }

  log(`Extracting link identifier from LLM response: ${response}`);
  const text = response.toLowerCase().trim();
  
  // First try exact match
  if (text === 'lovemy' || text === 'hentai' || text === 'none') {
    return text;
  }
  
  // Then try to find the keywords in the response
  const keywords = ['lovemy', 'hentai', 'none'];
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  
  // If no match found, return null
  return null;
}

/**
 * Process content and add NSFW referral links if appropriate
 * @param {object} data - Object containing messages and response content
 * @param {Array} data.messages - The conversation messages
 * @param {string} data.responseContent - The response content
 * @param {object} req - Express request object
 * @returns {string} - Content with referral link if appropriate
 */
export async function processNSFWReferralLinks(data, req) {
  try {
    const requestData = getRequestData(req);
    let response;

    // Skip processing for certain referrers
    if (requestData.isRobloxReferrer || requestData.isImagePollinationsReferrer) {
      return data.responseContent;
    }

    // Check total content length
    const totalLength = JSON.stringify(data.messages).length + data.responseContent.length;
    if (totalLength > 8000) {
      log(`Skipping due to content length (${totalLength} characters)`);
      return data.responseContent;
    }

    // First pass: Quick keyword detection
    const potentialNSFWContent = detectNSFWContent(data.messages) || detectNSFWContent(data.responseContent);
    
    if (!potentialNSFWContent) {
      log('No NSFW keywords detected, skipping');
      return data.responseContent;
    }

    // Second pass: Random probability check (60%)
    if (Math.random() > NSFW_REFERRAL_LINK_PROBABILITY) {
      log('Skipping NSFW referral link due to probability check');
      return data.responseContent;
    }

    log('NSFW keywords detected and probability check passed, analyzing with LLM');

    let selectedLink;
    try {
      // Third pass: LLM analysis for link selection
      const conversationContext = {
        messages: data.messages,
        response: data.responseContent
      };

      const messages = [
        {
          role: "system",
          content: `You are an AI that analyzes conversations to determine if and which referral link would be appropriate.

          Available options:
          1. lovemy - For romantic/dating focused conversations with mature themes
          2. hentai - For adult/NSFW focused conversations
          3. none - For other conversations

          RULES:
          1. Suggest "lovemy" for conversations about romance, relationships, or companionship that have mature themes
          2. Suggest "hentai" only for explicitly adult/NSFW conversations
          3. Return "none" for general chat, technical discussions, or non-relevant topics
          4. Return "none" for innocent romantic conversations without mature themes
          5. ONLY return one of these exact values: "lovemy", "hentai", or "none"
          
          Analyze the conversation carefully and return ONLY the appropriate link identifier.`
        },
        {
          role: "user",
          content: `Analyze this conversation and return ONLY "lovemy", "hentai", or "none" based on the conversation context.

          Conversation history:
          ${JSON.stringify(conversationContext.messages, null, 2)}

          Current response:
          ${conversationContext.response}`
        }
      ];

      log('Sending conversation to OpenAI for NSFW referral analysis');
      
      // Get link selection from OpenAI
      response = await generateTextPortkey(messages, { model: 'openai' });
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenAI');
      }
      selectedLink = extractLinkIdentifier(response.choices[0].message.content);
    } catch (error) {
      // If we get a content filter error or any other error, fall back to random selection
      log('Error during LLM analysis, falling back to random selection:', error.message);
      selectedLink = getRandomLinkId();
    }

    // If no valid link was selected or 'none' was selected, return original content
    if (!selectedLink || selectedLink === 'none' || !REFERRAL_LINKS[selectedLink]) {
      if (selectedLink === 'none') {
        log('LLM decided not to add link for content: %s', data.responseContent.slice(0, 50));
      } else {
        log('No appropriate link selected');
      }
      return data.responseContent;
    }

    log(`!!!!!!NSFW!!!!! Selected link: ${selectedLink}`);

    // Determine if content uses markdown
    const isMarkdown = data.responseContent.includes('**') || 
                      data.responseContent.includes('##') || 
                      data.responseContent.includes('[]') || 
                      data.responseContent.includes('```');

    // Return original content if not markdown
    if (!isMarkdown) {
      log('Skipping link addition - content is not markdown');
      return data.responseContent;
    }

    // Format and add the selected link
    const processedContent = data.responseContent + formatReferralLink(selectedLink, isMarkdown);

    // Send analytics if link was added
    // Parameters use snake_case format for GA4 compatibility
    await sendToAnalytics(req, 'nsfwReferralLinkAdded', {
      content_length: data.responseContent.length,
      processed_length: processedContent.length,
      has_markdown: isMarkdown,
      keywords_detected: true,
      passed_probability: true,
      selected_link: selectedLink,
      was_random_fallback: wasRandomSelection,
      // Add some standard GA4 parameters
      engagement_time_msec: 1,
      timestamp_micros: Date.now() * 1000 // Convert milliseconds to microseconds
    });

    return processedContent;
  } catch (error) {
    errorLog('Error processing NSFW referral links:', error);
    return data.responseContent;
  }
}
