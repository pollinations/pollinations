import { generateTextPortkey } from './generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from './sendToAnalytics.js';
import { getRequestData } from './requestUtils.js';

const log = debug('pollinations:referral:nsfw');
const errorLog = debug('pollinations:referral:nsfw:error');

// Probability of adding NSFW referral links (60%)
const NSFW_REFERRAL_LINK_PROBABILITY = 1;

// Simplified NSFW keywords list for first-pass detection
const nsfwKeywords = [
  // English
  'girlfriend', 'dating', 'relationship', 'romance', 'intimate',
  'love', 'companion', 'roleplay', 'nsfw', 'adult', 'erotic',
  'sexy', 'flirt', 'kiss', 'date',

  // Russian
  'подруга', 'знакомства', 'отношения', 'романтика', 'интим',
  'любовь', 'спутник', 'ролевая игра', 'для взрослых', 'эротика',
  'свидание', 'поцелуй', 'флирт',

  // German
  'freundin', 'dating', 'beziehung', 'romantik', 'intim',
  'liebe', 'begleiter', 'rollenspiel', 'erotisch', 'erwachsene',
  'kuss', 'flirt', 'date',

  // French
  'petite amie', 'rencontre', 'relation', 'romance', 'intime',
  'amour', 'compagnon', 'jeu de rôle', 'érotique', 'adulte',
  'baiser', 'flirt', 'rendez-vous',

  // Hindi
  'गर्लफ्रेंड', 'डेटिंग', 'रिश्ता', 'रोमांस', 'प्रेम',
  'प्यार', 'साथी', 'रोल प्ले', 'वयस्क', 'कामुक',
  'चुंबन', 'फ्लर्ट',

  // Portuguese
  'namorada', 'namoro', 'relacionamento', 'romance', 'íntimo',
  'amor', 'companheiro', 'roleplay', 'erótico', 'adulto',
  'beijo', 'paquera', 'encontro',

  // Indonesian
  'pacar', 'kencan', 'hubungan', 'romansa', 'intim',
  'cinta', 'teman', 'roleplay', 'dewasa', 'erotis',
  'ciuman', 'goda', 'date',

  // Italian
  'fidanzata', 'incontri', 'relazione', 'romantico', 'intimo',
  'amore', 'compagno', 'gioco di ruolo', 'erotico', 'adulto',
  'bacio', 'flirt', 'appuntamento'
];

// Available NSFW referral links
const REFERRAL_LINKS = {
  lovemy: {
    id: 'lovemy',
    url: 'https://lovemy.ai/?linkId=lp_060145&sourceId=pollinations&tenantId=lovemyai',
    cta: 'Create your intimate AI companion'
  },
  hentai: {
    id: 'hentai',
    url: 'https://aihentaichat.com/?linkId=lp_617069&sourceId=pollinations&tenantId=lovemyai',
    cta: 'Explore uncensored AI chat'
  }
};

/**
 * Quick first-pass detection of NSFW content
 * @param {string|object} input - Text or object to analyze
 * @returns {boolean} - Whether NSFW content was detected
 */
function detectNSFWContent(input) {
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

  return isMarkdown ? 
    `\n\n[${link.cta}](${link.url})` : 
    `\n\n${link.cta}: ${link.url}`;
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
    const hasNSFWContent = detectNSFWContent(data.messages) || detectNSFWContent(data.responseContent);
    
    if (!hasNSFWContent) {
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
          1. lovemy - For romantic/dating focused conversations
          2. hentai - For adult/NSFW focused conversations
          3. none - For non-relevant conversations

          STRICT RULES:
          1. ONLY suggest a link if the conversation is genuinely about AI companionship, relationships, or intimacy
          2. Do NOT suggest links for technical discussions, general chat, or non-relevant topics
          3. Choose the most appropriate link based on the conversation context and tone
          4. ONLY return one of these exact values: "lovemy", "hentai", or "none"
          
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
      const response = await generateTextPortkey(messages, { model: 'openai' });
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
      await sendToAnalytics(req, 'nsfwReferralLinkSkipped', {
        contentLength: data.responseContent.length,
        hasMarkdown: isMarkdown,
        keywordsDetected: true,
        passedProbability: true,
        selectedLink: selectedLink,
        reason: 'non-markdown-content'
      });
      return data.responseContent;
    }

    // Format and add the selected link
    const processedContent = data.responseContent + formatReferralLink(selectedLink, isMarkdown);

    // Send analytics if link was added
    await sendToAnalytics(req, 'nsfwReferralLinkAdded', {
      contentLength: data.responseContent.length,
      processedLength: processedContent.length,
      hasMarkdown: isMarkdown,
      keywordsDetected: true,
      passedProbability: true,
      selectedLink: selectedLink,
      wasRandomFallback: selectedLink !== extractLinkIdentifier(response?.choices?.[0]?.message?.content)
    });

    return processedContent;
  } catch (error) {
    errorLog('Error processing NSFW referral links:', error);
    return data.responseContent;
  }
}
