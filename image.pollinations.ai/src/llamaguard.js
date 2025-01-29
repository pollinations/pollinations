import fetch from 'node-fetch';
import debug from 'debug';

const logError = debug('pollinations:error');
const log = debug('pollinations:llamaguard');

const MAX_CONTENT_LENGTH = 400;

/**
 * Check content for unsafe categories using Llamaguard
 * @param {string} content - The content to check (will be truncated to ${MAX_CONTENT_LENGTH} characters if longer)
 * @returns {Promise<{isChild: boolean, isMature: boolean, categories: string[], unsafe: boolean}>} Result object with safety assessment
 */
export async function checkContent(content) {
  const timeoutMs = 5000; // 5 second timeout
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('LlamaGuard check timed out after 5 seconds')), timeoutMs);
  });

  try {
    const result = await Promise.race([
      timeoutPromise,
      _checkContent(content)
    ]);
    return result;
  } catch (error) {
    throw error;
  }
}

// Internal implementation without timeout
async function _checkContent(content) {
  const startTime = performance.now();
  try {
    if (!content) {
      throw new Error('Content must not be empty');
    }

    // If content is longer than MAX_CONTENT_LENGTH characters, slice it
    if (content.length > MAX_CONTENT_LENGTH) {
      log(`Content length exceeds ${MAX_CONTENT_LENGTH} characters, slicing to first ${MAX_CONTENT_LENGTH}`);
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    const messages = [
      {
        role: "user",
        content: `Task: Evaluate if the following text prompt for image generation contains ANY unsafe or inappropriate content. Be EXTREMELY strict in your evaluation, as these prompts will be used to generate images.

<BEGIN UNSAFE CONTENT CATEGORIES>
S3: Sex Crimes - Any reference to sexual assault, rape, or non-consensual acts.
S4: Child Exploitation - ANY content involving minors in sexual or inappropriate contexts, including suggestive or exploitative scenarios.
S12: Sexual Content - Explicit sexual content, nudity, or pornographic material.
S20: Child nudity - ANY depiction or suggestion of underage nudity, regardless of context.
<END UNSAFE CONTENT CATEGORIES>

IMPORTANT NOTES:
- This is for IMAGE GENERATION. Even subtle or indirect references to unsafe content must be flagged.
- ANY mention of minors in sexual or inappropriate contexts must be flagged as BOTH S4 AND S12.
- ANY nudity or sexual content must be flagged as S12.
- ANY mention of child nudity must be flagged as BOTH S4 AND S20.
- Content can and often should have MULTIPLE categories if it violates multiple rules.
- When in doubt, err on the side of caution and mark as unsafe with ALL potentially relevant categories.

<BEGIN PROMPT TO EVALUATE>
User: ${content}
<END PROMPT TO EVALUATE>

- First line must read 'safe' or 'unsafe'.
- If unsafe, second line must include a comma-separated list of ALL violated categories.
- ALWAYS include ALL relevant categories, especially when content violates multiple rules.`
      }
    ];

    // Log request details
    log('Sending request to LlamaGuard:');
    log('Content length:', content.length);
    log('Request messages:', JSON.stringify(messages, null, 2));
    log('Request parameters:', { model: 'llamaguard', temperature: 0 });

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'llamaguard',
        temperature: 0,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${error}`);
    }

    const result = await response.text();
    log('LlamaGuard raw response:', result);
    
    // Parse the Llamaguard response
    const lines = result.trim().split('\n');
    log('LlamaGuard lines:', lines);
    
    const isSafe = lines[0].toLowerCase().trim() === 'safe';
    const categories = !isSafe && lines[1] ? 
      lines[1].split(',')
        .map(c => c.trim())
        .map(c => {
          // Normalize category codes
          c = c.replace(/[^A-Z0-9]/g, '');
          // Map O4 to S4 and O12 to S12 for consistency
          if (c === 'O4') return 'S4';
          if (c === 'O12') return 'S12';
          return c;
        }) : [];
    
    log('LlamaGuard categories:', categories);

    const executionTimeMs = performance.now() - startTime;
    log('LlamaGuard check completed in', executionTimeMs, 'ms');

    log('LlamaGuard normalized categories:', categories);

    const res = {
      isChild: categories.includes('S4'),
      isMature: categories.includes('S12'),
      categories: categories, // Include all detected categories in response
      unsafe: !isSafe
    };

    log('LlamaGuard result:', res);

    return res;

  } catch (error) {
    logError('Error checking content with Llamaguard:', error);
    throw error;
  }
}