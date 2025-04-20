import starsData from '../config/github-stars.json';

/**
 * Extracts repository owner and name from a GitHub URL
 * @param {string} url - GitHub repository URL
 * @returns {Object|null} Object containing owner and repo or null if not a valid GitHub URL
 */
export function extractRepoInfo(url) {
  if (!url) return null;
  
  // Handle both full URLs and shorthand URLs
  const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
  const match = url.match(githubRegex);
  
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '') // Remove .git extension if present
    };
  }
  
  return null;
}

/**
 * Gets the star count for a GitHub repository
 * @param {string} url - GitHub repository URL
 * @returns {number|null} Number of stars or null if not available
 */
export function getStarCount(url) {
  const repoInfo = extractRepoInfo(url);
  if (!repoInfo) return null;
  
  const key = `${repoInfo.owner}/${repoInfo.repo}`;
  return starsData[key]?.stars || null;
}

/**
 * Formats a star count for display
 * @param {number} stars - Number of stars
 * @returns {string} Formatted star count (e.g., "1.2k" for 1200)
 */
export function formatStarCount(stars) {
  if (stars === null || stars === undefined) return '';
  
  if (stars < 1000) {
    return stars.toString();
  } else {
    return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
}
