import { generateTextPortkey } from './generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from './sendToAnalytics.js';
import { getRequestData } from './requestUtils.js';
import { nsfwKeywords } from './nsfwKeywords.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = debug('pollinations:affiliate');
const errorLog = debug('pollinations:affiliate:error');

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the most recent campaign data file
const CAMPAIGN_DATA_DIR = path.join(__dirname, '..', '..', 'affiliate', 'impact', 'scripts', 'processed');
const LOG_FILE_PATH = path.join(__dirname, 'logs', 'affiliate_links.log');

// Probability settings
const PROBABILITY_SETTINGS = {
  nsfw: 0.6,  // 60% chance for NSFW content (same as before)
  sfw: 0.01,  // 1% chance for SFW content (same as before)
  kofi: 0.005 // 0.5% chance for donation link
};

// Cache for affiliate data
let affiliateData = null;

/**
 * Load the most recent campaign data file
 * @returns {Object} The campaign data mapping
 */
export function loadAffiliateData() {
  try {
    if (affiliateData) return affiliateData;
    
    // Find the most recent campaign data file
    const files = fs.readdirSync(CAMPAIGN_DATA_DIR)
      .filter(file => file.startsWith('campaign_first_items_') && file.endsWith('.json'))
      .sort()
      .reverse();
    
    if (!files.length) {
      errorLog('No campaign data files found');
      return {};
    }
    
    const filePath = path.join(CAMPAIGN_DATA_DIR, files[0]);
    log(`Loading affiliate data from: ${filePath}`);
    
    const fileData = fs.readFileSync(filePath, 'utf8');
    affiliateData = JSON.parse(fileData);
    
    log(`Loaded ${Object.keys(affiliateData).length} campaigns`);
    return affiliateData;
  } catch (error) {
    errorLog('Error loading affiliate data:', error);
    return {};
  }
}

/**
 * Log affiliate link addition to a file for monitoring
 * @param {object} data - The data that triggered the link addition
 * @param {string} campaignName - The campaign that was selected
 * @param {object} campaignData - The campaign data
 * @param {string} originalContent - The original response content
 * @param {string} processedContent - The response with the link added
 */
function logAffiliateAddition(data, campaignName, campaignData, originalContent, processedContent) {
  try {
    // Ensure the logs directory exists
    const logsDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString();
    
    // Format the log entry
    let logString = `# Affiliate Link Addition - ${timestamp}\n\n`;
    logString += `## Campaign: ${campaignName}\n\n`;
    logString += `## Link Info:\n- ID: ${campaignData.id}\n- Name: ${campaignData.name}\n- Product: ${campaignData.affiliateProduct || 'N/A'}\n- URL: ${campaignData.trackingLink}\n\n`;
    
    // Add conversation messages if available
    if (data.messages && data.messages.length > 0) {
      logString += `## Conversation Messages:\n\n`;
      data.messages.forEach((msg, index) => {
        logString += `### Message ${index + 1} (${msg.role}):\n\n${msg.content}\n\n`;
      });
    }
    
    // Add original and processed content
    logString += `## Original Content:\n\n${originalContent}\n\n`;
    logString += `## Processed Content (with link):\n\n${processedContent}\n\n`;
    
    // Add separator for easier reading
    logString += `-------------------------------------------\n\n`;
    
    fs.appendFileSync(LOG_FILE_PATH, logString);
    log(`Logged affiliate link addition to ${LOG_FILE_PATH}`);
  } catch (error) {
    errorLog('Error logging affiliate link addition:', error);
  }
}

/**
 * Quick first-pass detection of NSFW content
 * @param {string|object} input - Text or object to analyze
 * @returns {boolean} - Whether NSFW content was detected
 */
function detectNSFWContent(input) {
  const textToAnalyze = typeof input === 'string' ? 
    input.toLowerCase() : 
    JSON.stringify(input).toLowerCase();
  
  // Split text into words using regex to handle various separators
  const words = textToAnalyze.split(/[\s,.!?;:()\[\]{}"'\/\\<>-]+/).filter(word => word.length > 0);
  
  // Check for whole words rather than substrings to avoid false positives
  return nsfwKeywords.some(keyword => {
    // For single-word keywords, check if it's in our word list
    if (!keyword.includes(' ')) {
      return words.includes(keyword);
    }
    // For multi-word keywords, check for the exact phrase
    return textToAnalyze.includes(keyword);
  });
}

/**
 * Format an affiliate link based on content type
 * @param {object} campaignData - The campaign data
 * @param {boolean} isMarkdown - Whether to use markdown formatting
 * @returns {string} - Formatted affiliate link
 */
function formatAffiliateLink(campaignData, isMarkdown = true) {
  // For non-markdown formats, just return a basic text link
  if (!isMarkdown) {
    return `\n\n${campaignData.description || campaignData.name} - ${campaignData.trackingLink}`;
  }
  
  // Use the product description if available
  const productDesc = campaignData.affiliateProduct || campaignData.description || campaignData.name;
  
  // NSFW links (lovemy.ai, aihentaichat.com)
  if (campaignData.id === 'lovemy' || campaignData.id === 'hentai') {
    let phrase = '';
    if (campaignData.id === 'lovemy') {
      phrase = 'Looking for a more personal connection?';
    } else if (campaignData.id === 'hentai') {
      phrase = 'Want to explore without limits?';
    }
    
    return `\n\n---\n${phrase} [${campaignData.name}](${campaignData.trackingLink})`;
  }
  
  // Ko-fi donation link
  if (campaignData.id === 'kofi') {
    return `\n\n---\nEnjoy using our service? [${campaignData.name}](${campaignData.trackingLink})`;
  }
  
  // Default format for other affiliate links - using product description for better context
  return `\n\n---\nYou might be interested in: [${productDesc}](${campaignData.trackingLink})`;
}

/**
 * Extract the campaign identifier from the LLM response
 * @param {string} response - The LLM response text
 * @returns {string|null} - The campaign identifier or null if none found
 */
function extractCampaignIdentifier(response) {
  if (!response) return null;
  
  // Clean up the response text
  const cleanedResponse = response.trim().toLowerCase();
  
  // First look for exact matches
  if (cleanedResponse === 'lovemy') return 'lovemy';
  if (cleanedResponse === 'hentai') return 'hentai';
  if (cleanedResponse === 'kofi') return 'kofi';
  if (cleanedResponse === 'none') return 'none';
  
  // If no exact match, try to extract from text
  if (cleanedResponse.includes('lovemy')) return 'lovemy';
  if (cleanedResponse.includes('hentai')) return 'hentai';
  if (cleanedResponse.includes('kofi')) return 'kofi';
  if (cleanedResponse.includes('none')) return 'none';
  
  // No valid identifier found
  return null;
}

/**
 * FUTURE ENHANCEMENT: Find the most relevant campaign based on content
 * This function will analyze the conversation and content to find the most
 * relevant SFW campaign to promote.
 * 
 * @param {object} data - Object containing messages and response content
 * @param {Array} data.messages - The conversation messages
 * @param {string} data.responseContent - The response content
 * @param {object} campaigns - Available campaigns
 * @returns {object|null} - Selected campaign or null if none is relevant
 */
function findRelevantCampaign(data, campaigns) {
  // This is a placeholder for future implementation
  // In the future, this could use:
  // 1. Extract keywords/topics from messages and response
  // 2. Match against campaign.affiliateProduct and affiliateCategory
  // 3. Use the affiliateAudience to ensure targeting relevance
  // 4. Potentially use an LLM to score relevance of each campaign
  
  // For now, just return the Ko-fi campaign for SFW content
  return campaigns['Support Pollinations on Ko-fi'];
}

/**
 * Process content and add affiliate links if appropriate
 * @param {object} data - Object containing messages and response content
 * @param {Array} data.messages - The conversation messages
 * @param {string} data.responseContent - The response content
 * @param {object} req - Express request object
 * @returns {Promise<string>} - Content with affiliate link if appropriate
 */
export async function processAffiliateLinks(data, req) {
  try {
    // Make sure we have data to work with
    if (!data || !data.responseContent) {
      return data?.responseContent || '';
    }
    
    // In test environment, req might be undefined
    const requestData = req ? getRequestData(req) : { 
      isRobloxReferrer: false, 
      isImagePollinationsReferrer: false 
    };

    // Skip processing if referrer is Roblox or from image.pollinations.ai
    if (requestData.isRobloxReferrer || requestData.isImagePollinationsReferrer) {
      return data.responseContent;
    }
    
    // Load affiliate data if not already loaded
    const campaigns = loadAffiliateData();
    if (!campaigns || Object.keys(campaigns).length === 0) {
      log('No affiliate campaigns found, skipping');
      return data.responseContent;
    }
    
    // Check if content contains markdown
    const isMarkdown = data.responseContent.includes('**') || 
                      data.responseContent.includes('##') || 
                      data.responseContent.includes('[]') || 
                      data.responseContent.includes('```');
    
    if (!isMarkdown) {
      log('Skipping affiliate link - content is not markdown');
      return data.responseContent;
    }
    
    // Detect NSFW content
    const containsNSFW = detectNSFWContent(data.messages) || detectNSFWContent(data.responseContent);
    
    // Apply probability check based on content type
    const probabilityThreshold = containsNSFW ? 
      PROBABILITY_SETTINGS.nsfw : 
      PROBABILITY_SETTINGS.sfw;
    
    // Random check - only process based on probability threshold
    if (Math.random() > probabilityThreshold) {
      return data.responseContent;
    }
    
    let selectedCampaign = null;
    
    // For NSFW content, use the LLM to help classify and select appropriate affiliate
    if (containsNSFW) {
      log('NSFW content detected, selecting appropriate affiliate');
      
      try {
        // Prepare the prompt for OpenAI to choose between lovemy, hentai, or none
        const messages = [
          {
            role: "system",
            content: `You are an AI that analyzes conversations to determine IF a referral link should be shown, and which one. 
            
            Return EXACTLY ONE of these link identifiers:
            1. lovemy - For romantic/relationship/companionship with mature themes
            2. hentai - For explicitly adult/NSFW with sexual content
            3. none - For other conversations

            RULES:
            1. Suggest "lovemy" ONLY for conversations about romance, relationships, or companionship with CLEAR mature or adult themes
            2. Suggest "hentai" ONLY for conversations that are EXPLICITLY adult/NSFW with CLEAR sexual content
            3. Return "none" for ALL other content including:
               - General chat or discussions
               - Technical discussions
               - News or informational content
               - Political or social commentary
               - Innocent romantic conversations without mature themes
               - Any content where you're uncertain about its nature
            4. Be EXTREMELY conservative - if you have ANY doubt, return "none"
            5. The content may be in ANY language - do NOT use the presence of foreign language as a reason to return an affiliate link
            6. ONLY return one of these exact values: "lovemy", "hentai", or "none"`
          },
          {
            role: "user",
            content: `Analyze this conversation and return ONLY "lovemy", "hentai", or "none" based on the conversation context.

Conversation history:
${data.messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(-500)}

Current response:
${data.responseContent}`
          }
        ];

        log('Sending conversation to OpenAI for NSFW affiliate analysis');
        
        // Get link selection from OpenAI
        const response = await generateTextPortkey(messages, { model: 'openai' });
        if (!response?.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from OpenAI');
        }

        log('OpenAI response:', response.choices[0].message.content);
        const campaignId = extractCampaignIdentifier(response.choices[0].message.content);
        
        // If a valid campaign was selected (other than 'none'), find the campaign data
        if (campaignId && campaignId !== 'none') {
          if (campaignId === 'lovemy') {
            selectedCampaign = campaigns['LoveMy.ai'];
          } else if (campaignId === 'hentai') {
            selectedCampaign = campaigns['AIHentaiChat.com'];
          }
        }
      } catch (error) {
        // If OpenAI classification fails, we don't add a link
        errorLog('Error during LLM analysis:', error.message);
      }
    } else {
      // For SFW content, possibly add Ko-fi donation link or other relevant campaign
      
      // Simple probability check for Ko-fi link
      if (Math.random() <= PROBABILITY_SETTINGS.kofi) {
        selectedCampaign = campaigns['Support Pollinations on Ko-fi'];
      }
      
      // FUTURE ENHANCEMENT:
      // Here we would call the findRelevantCampaign function to get a product
      // relevant to the conversation context
      //
      // Implementation would:
      // 1. Extract key concepts from the conversation
      // 2. Match against campaign.affiliateProduct and affiliateCategory
      // 3. Find the most relevant product to promote
      //
      // const relevantCampaign = findRelevantCampaign(data, campaigns);
      // if (relevantCampaign) {
      //   selectedCampaign = relevantCampaign;
      // }
    }
    
    // If no campaign was selected, return original content
    if (!selectedCampaign) {
      log('No suitable affiliate campaign selected');
      return data.responseContent;
    }
    
    log(`Selected affiliate campaign: ${selectedCampaign.name} (${selectedCampaign.affiliateProduct || 'no product info'})`);
    
    // Format and add the selected affiliate link
    const processedContent = data.responseContent + formatAffiliateLink(selectedCampaign, isMarkdown);
    
    // Find the campaign name
    const campaignName = Object.keys(campaigns).find(name => campaigns[name].id === selectedCampaign.id) || 'Unknown';
    
    // Log this addition to a file for monitoring
    logAffiliateAddition(data, campaignName, selectedCampaign, data.responseContent, processedContent);
    
    // Send analytics event
    await sendToAnalytics(req, 'affiliateLinkAdded', {
      campaign_id: selectedCampaign.id,
      campaign_name: campaignName,
      product: selectedCampaign.affiliateProduct || '',
      content_length: data.responseContent.length,
      processed_length: processedContent.length,
      has_markdown: isMarkdown,
      is_nsfw: containsNSFW,
      engagement_time_msec: 1,
      timestamp_micros: Date.now() * 1000
    });
    
    return processedContent;
  } catch (error) {
    errorLog('Error processing affiliate links:', error);
    return data.responseContent;
  }
}
