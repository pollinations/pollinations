import debug from 'debug';
import crypto from 'crypto';
import { getIp } from '../../shared/extractFromRequest.js';

const log = debug('pollinations:nexad:client');
const errorLog = debug('pollinations:nexad:client:error');

// nex.ad API configuration
const NEX_AD_CONFIG = {
  endpoint: process.env.NEX_AD_ENDPOINT || 'https://api-prod.nex-ad.com/ad/request/v2',
  publisher: {
    publisher_id: 9,
    publisher_name: "Pollinations",
    publisher_type: "chatbot"
  }
};

/**
 * Extract topic from conversation
 * @param {Array} messages - Conversation messages
 * @param {string} currentContent - Current content being generated
 * @returns {string} - Extracted topic
 */
function extractTopic(messages, currentContent) {
  try {
    // Combine all messages to understand context
    const allMessages = messages.map(m => m.content || '').filter(Boolean);
    const fullContext = [...allMessages, currentContent].join(' ');
    
    // Simple topic extraction - could be enhanced
    const words = fullContext.split(/\s+/).filter(word => word.length > 4);
    const uniqueWords = [...new Set(words)];
    
    // Return first few meaningful words as topic
    return uniqueWords.slice(0, 5).join(' ').substring(0, 50);
  } catch (error) {
    errorLog('Error extracting topic:', error);
    return 'general conversation';
  }
}

/**
 * Format conversation history for nex.ad
 * @param {Array} messages - Conversation messages
 * @param {string} currentContent - Current content being generated
 * @returns {Array} - Formatted conversations
 */
function formatConversations(messages, currentContent) {
  try {
    // Include all messages plus current response
    const conversations = [];
    
    // Add all messages
    messages.forEach((msg, index) => {
      if (msg.role && msg.content) {
        conversations.push({
          id: index + 1,
          content: msg.content, // Full content, no truncation
          timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
          role: msg.role === 'user' ? 'user' : 'assistant'
        });
      }
    });
    
    // Add current response if available
    if (currentContent) {
      conversations.push({
        id: conversations.length + 1,
        content: currentContent, // Full content, no truncation
        timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        role: 'assistant'
      });
    }
    
    return conversations;
  } catch (error) {
    errorLog('Error formatting conversations:', error);
    return [];
  }
}

/**
 * Fetch ad from nex.ad API
 * @param {Object} visitorData - Visitor information
 * @param {Object} conversationContext - Chatbot context and conversation
 * @returns {Promise<Object|null>} - nex.ad response or null
 */
export async function fetchNexAd(visitorData, conversationContext) {
  try {
    const requestBody = {
      publisher: NEX_AD_CONFIG.publisher,
      visitor: visitorData,
      chatbot_context: conversationContext
    };
    
    log('Requesting ad from nex.ad:', JSON.stringify(requestBody, null, 2));
    
    // Track request timing
    const startTime = Date.now();
    
    const response = await fetch(NEX_AD_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const requestDuration = Date.now() - startTime;
    log(`nex.ad request completed in ${requestDuration}ms`);
    
    if (!response.ok) {
      errorLog(`nex.ad API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      errorLog('Error response:', errorText);
      return null;
    }
    
    const data = await response.json();
    log('nex.ad response:', JSON.stringify(data, null, 2));
    
    // Validate response has ads
    if (!data.ads || data.ads.length === 0) {
      log('No ads returned from nex.ad');
      return null;
    }
    
    return data;
  } catch (error) {
    errorLog('Error fetching nex.ad:', error);
    return null;
  }
}

/**
 * Create nex.ad request from express request and conversation
 * @param {Object} req - Express request object
 * @param {Array} messages - Conversation messages
 * @param {string} content - Current content
 * @returns {Object} - nex.ad request data
 */
export function createNexAdRequest(req, messages, content) {
  // Extract visitor data from request
  // Get IP both as full version for geo-targeting and hashed for user ID
  const fullIp = getIp(req, true) || 'unknown';
  const hashedIp = hashIPAddress(fullIp);
  
  // Create hash of IP + current date (without time) for daily session ID
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const sessionId = hashIPAddress(`${fullIp}_${currentDate}`, 'session-salt');
  
  const visitorData = {
    // Use hashed IP as the primary user identifier
    pub_user_id: hashedIp,
    // Use IP + current date as session ID (changes daily for same user)
    session_id: req.sessionID || sessionId,
    // Only include browser_id if it actually exists
    ...(req.cookies?.browser_id && { browser_id: req.cookies.browser_id }),
    user_agent: req.headers['user-agent'] || 'unknown',
    // Include full IP for geo-targeting/fraud detection as requested by NEX ad
    ip: fullIp,
    // Use full accept-language header value as ISO language tag
    language: req.headers['accept-language'] || 'en',
    referrer: req.headers.referer || req.headers.referrer || ''
  };
  
  // Create chatbot context
  const conversationContext = {
    bot_name: "Pollinations AI",
    bot_description: "AI-powered text generation and creative assistance",
    topic: extractTopic(messages, content),
    conversations: formatConversations(messages, content)
  };
  
  return { visitorData, conversationContext };
}

/**
 * Hash an IP address for privacy
 * @param {string} ip - IP address to hash
 * @param {string} [salt] - Optional salt to add to the hash
 * @returns {string} - Hashed IP address
 */
function hashIPAddress(ip, salt = process.env.IP_HASH_SALT || 'pollinations-salt') {
  // Return placeholder for unknown IPs
  if (!ip || ip === 'unknown') {
    return 'unknown';
  }
  
  try {
    // Create a SHA-256 hash of the IP with salt
    return crypto
      .createHash('sha256')
      .update(`${ip}${salt}`)
      .digest('hex')
      // Truncate to first 16 characters for reasonable length while maintaining uniqueness
      .substring(0, 16);
  } catch (error) {
    errorLog('Error hashing IP address:', error);
    return 'hash_error';
  }
}

// Helper function for user ID generation (rarely used now with IP hashing)
function generateUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
