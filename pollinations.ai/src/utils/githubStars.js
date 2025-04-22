/**
 * Utility to handle GitHub star counts for repositories
 * This approach allows for adding star counts without modifying all project entries
 */

// Mapping of repository paths to their star counts
// Format: "owner/repo": stars
const starCounts = {
  // LLM Integrations
  "xtekky/gpt4free": 64100,
  "lobehub/lobe-chat": 59000, 
  "SillyTavern/SillyTavern": 13700,
  "QwenLM/Qwen-Agent": 6600,
  "Th3-C0der/DynaSpark": 20,
  "Azad-sl/FreeAI": 44,
  "MMojoCoder/PrivatePollenAI": 2,
  
  // SDK & Libraries
  "1038lab/ComfyUI-Pollinations": 29,
  "fqueis/pollinationsai": 11,
  "pinkpixel-dev/MCPollinations": 6,
  "yehigo/pollinations.ai": 4,
  
  // Tutorials & Other
  "cloph-dsp/Pollinations-AI-in-OpenWebUI": 5,
  
  // Core
  "pollinations/pollinations": 1645,
  
  // Creative Apps
  "Circuit-Overtime/elixpo_ai_chapter": 8,
  "Azad-sl/tts": 2,
  "AminMusah/ai-image-generator": 1,
  
  // Other categories
  "YoannDev90/AlphaLLM": 5,
  "mahmood-asadi/ai-vision-block": 5,
  "cmunozdev/DominiSigns": 3,
  "CitizenOneX/frame_pollinations": 3
};

/**
 * Extract owner and repo from a GitHub URL
 * @param {string} url - GitHub repository URL
 * @returns {string|null} The repo path in format "owner/repo" or null if not a GitHub URL
 */
export function extractRepoPath(url) {
  if (!url) return null;
  
  // Handle both full URLs and shorthand URLs
  const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
  const match = url.match(githubRegex);
  
  if (match) {
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '').split('#')[0].split('?')[0];
    return `${owner}/${repo}`;
  }
  
  return null;
}

/**
 * Get star count for a GitHub repository URL
 * @param {string} url - GitHub repository URL
 * @returns {number|null} Star count or null if not found
 */
export function getStarCount(url) {
  const repoPath = extractRepoPath(url);
  if (!repoPath) return null;
  
  return starCounts[repoPath] || null;
}

export default {
  getStarCount,
  extractRepoPath
};
