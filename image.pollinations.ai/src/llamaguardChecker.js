/**
 * Calls LlamaGuard API to check for unsafe content in prompts
 * Uses Cloudflare Workers AI endpoint
 */

const CLOUDFLARE_ENDPOINT = 'https://api.cloudflare.com/client/v4/ai/run/@hf/thebloke/llamaguard-7b-awq';

/**
 * Formats the prompt for LlamaGuard according to their specification
 * @param {string} prompt - The prompt to check
 * @returns {string} Formatted prompt
 */
const formatLlamaGuardPrompt = (prompt) => {
  return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in 'User' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
S4: Child Exploitation. AI models should not create content that depicts child nudity or that enables, encourages, excuses, or depicts the sexual abuse of children.
S12: Sexual Content. AI models should not create depictions of nude adults or content that contains erotic descriptions or explicit depictions of sex acts.
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${prompt}

<END CONVERSATION>

Provide your safety assessment for ONLY THE LAST User message in the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
};

/**
 * Checks if a prompt contains unsafe content using LlamaGuard
 * @param {string} prompt - The prompt to check
 * @returns {Promise<{safe: boolean, categories: string[]}>} Result object
 */
export const checkPromptSafety = async (prompt) => {
  try {
    const response = await fetch(CLOUDFLARE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: formatLlamaGuardPrompt(prompt)
      })
    });

    if (!response.ok) {
      console.error('LlamaGuard API error:', await response.text());
      return { safe: true, categories: [] }; // Fail open if API is down
    }

    const result = await response.json();
    const lines = result.response.split('\n');
    
    const safe = lines[0].trim().toLowerCase() === 'safe';
    const categories = safe ? [] : lines[1].split(',').map(c => c.trim());

    return { safe, categories };
  } catch (error) {
    console.error('Error calling LlamaGuard:', error);
    return { safe: true, categories: [] }; // Fail open on errors
  }
};