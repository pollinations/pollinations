import { debug } from '../utils/debug.js';

const log = debug('ads:nexAdClient');
const errorLog = debug('ads:nexAdClient:error');

// nex.ad API configuration
const NEX_AD_CONFIG = {
  endpoint: process.env.NEX_AD_ENDPOINT || 'https://api-prod.nex-ad.com/ad/request/v2',
  publisher: {
    publisher_id: 9,
    publisher_name: "Pollinations",
    publisher_type: "chatbot"
  },
  timeout: 2000 // 2 second timeout to not slow down responses
};

/**
 * Extract relevant topic from conversation messages
 * @param {Array} messages - Conversation messages
 * @param {string} currentContent - Current content being generated
 * @returns {string} - Extracted topic
 */
function extractTopic(messages, currentContent) {
  try {
    // Combine recent messages to understand context
    const recentMessages = messages.slice(-3).map(m => m.content || '').filter(Boolean);
    const fullContext = [...recentMessages, currentContent].join(' ');
    
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
    // Include last few messages plus current response
    const conversations = [];
    
    // Add recent messages
    messages.slice(-2).forEach((msg, index) => {
      if (msg.role && msg.content) {
        conversations.push({
          id: index + 1,
          text: msg.content.substring(0, 500), // Limit length
          timestamp: new Date().toISOString(),
          sender: msg.role === 'user' ? 'user' : 'bot'
        });
      }
    });
    
    // Add current response if available
    if (currentContent) {
      conversations.push({
        id: conversations.length + 1,
        text: currentContent.substring(0, 500),
        timestamp: new Date().toISOString(),
        sender: 'bot'
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
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NEX_AD_CONFIG.timeout);
    
    const response = await fetch(NEX_AD_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
    if (error.name === 'AbortError') {
      errorLog('nex.ad request timed out');
    } else {
      errorLog('Error fetching nex.ad:', error);
    }
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
  const visitorData = {
    pub_user_id: req.sessionID || req.headers['x-session-id'] || generateUserId(),
    session_id: req.sessionID || generateSessionId(),
    browser_id: req.cookies?.browser_id || generateBrowserId(),
    user_agent: req.headers['user-agent'] || 'unknown',
    ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown',
    language: req.headers['accept-language']?.split(',')[0] || 'en',
    referrer: req.headers.referer || req.headers.referrer || '',
    email: req.user?.email || undefined // If authenticated
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

// Helper functions for ID generation
function generateUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateBrowserId() {
  return `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
