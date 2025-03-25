/**
 * Pollinations Reddit Service
 * 
 * Functions for interacting with Reddit's unauthenticated JSON API
 */

/**
 * Get posts from a subreddit with various filters
 * 
 * @param {string} subreddit - The subreddit name (without r/)
 * @param {string} [listing="hot"] - Type of listing (hot, new, top, rising, controversial)
 * @param {number} [limit=25] - Number of posts to retrieve (max 100)
 * @param {string} [timeframe="day"] - Time frame for top/controversial listings (hour, day, week, month, year, all)
 * @returns {Promise<Object>} - JSON response containing subreddit posts
 */
export async function getRedditSubredditPosts(subreddit, listing = "hot", limit = 25, timeframe = "day") {
  if (!subreddit || typeof subreddit !== 'string') {
    throw new Error('Subreddit is required and must be a string');
  }
  
  // Validate listing parameter
  const validListings = ['hot', 'new', 'top', 'rising', 'controversial'];
  if (!validListings.includes(listing)) {
    throw new Error(`Invalid listing type. Must be one of: ${validListings.join(', ')}`);
  }
  
  // Validate limit parameter
  if (limit > 100) {
    limit = 100; // Reddit API limit is 100
  }
  
  // Build the URL
  let url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${listing}.json?limit=${limit}`;
  
  // Add timeframe parameter for top and controversial listings
  if (['top', 'controversial'].includes(listing)) {
    url += `&t=${timeframe}`;
  }
  
  try {
    // Fetch the data from Reddit
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pollinations-MCP/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get Reddit posts: ${response.statusText}`);
    }
    
    // Return the JSON response directly (thin proxy)
    return await response.json();
  } catch (error) {
    console.error('Error getting Reddit posts:', error);
    throw error;
  }
}

/**
 * Get a specific post and its comments
 * 
 * @param {string} postId - The Reddit post ID
 * @param {string} subreddit - The subreddit name (without r/)
 * @returns {Promise<Object>} - JSON response containing post and comments
 */
export async function getRedditPostAndComments(postId, subreddit) {
  if (!postId || typeof postId !== 'string') {
    throw new Error('Post ID is required and must be a string');
  }
  
  if (!subreddit || typeof subreddit !== 'string') {
    throw new Error('Subreddit is required and must be a string');
  }
  
  // Build the URL
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}.json`;
  
  try {
    // Fetch the data from Reddit
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pollinations-MCP/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get Reddit post and comments: ${response.statusText}`);
    }
    
    // Return the JSON response directly (thin proxy)
    return await response.json();
  } catch (error) {
    console.error('Error getting Reddit post and comments:', error);
    throw error;
  }
}

/**
 * Get posts from a specific Reddit user
 * 
 * @param {string} username - The Reddit username (without u/)
 * @param {string} [listing="new"] - Type of listing (overview, submitted, comments, gilded, upvoted, downvoted, hidden, saved)
 * @param {number} [limit=25] - Number of posts to retrieve (max 100)
 * @returns {Promise<Object>} - JSON response containing user posts
 */
export async function getRedditUserPosts(username, listing = "new", limit = 25) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required and must be a string');
  }
  
  // Validate limit parameter
  if (limit > 100) {
    limit = 100; // Reddit API limit is 100
  }
  
  // Build the URL
  const url = `https://www.reddit.com/user/${encodeURIComponent(username)}/${listing}.json?limit=${limit}`;
  
  try {
    // Fetch the data from Reddit
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pollinations-MCP/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get Reddit user posts: ${response.statusText}`);
    }
    
    // Return the JSON response directly (thin proxy)
    return await response.json();
  } catch (error) {
    console.error('Error getting Reddit user posts:', error);
    throw error;
  }
}

/**
 * Search across Reddit or within a subreddit
 * 
 * @param {string} query - The search query
 * @param {string} [subreddit=null] - The subreddit to search within (null for all of Reddit)
 * @param {number} [limit=25] - Number of results to retrieve (max 100)
 * @param {string} [sort="relevance"] - Sort method (relevance, hot, new, top, comments)
 * @returns {Promise<Object>} - JSON response containing search results
 */
export async function searchReddit(query, subreddit = null, limit = 25, sort = "relevance") {
  if (!query || typeof query !== 'string') {
    throw new Error('Search query is required and must be a string');
  }
  
  // Validate sort parameter
  const validSorts = ['relevance', 'hot', 'new', 'top', 'comments'];
  if (!validSorts.includes(sort)) {
    throw new Error(`Invalid sort type. Must be one of: ${validSorts.join(', ')}`);
  }
  
  // Validate limit parameter
  if (limit > 100) {
    limit = 100; // Reddit API limit is 100
  }
  
  // Build the URL
  let baseUrl = 'https://www.reddit.com';
  if (subreddit) {
    baseUrl += `/r/${encodeURIComponent(subreddit)}`;
  }
  baseUrl += '/search.json';
  
  const params = new URLSearchParams({
    q: query,
    limit: limit,
    sort: sort
  });
  
  const url = `${baseUrl}?${params.toString()}`;
  
  try {
    // Fetch the data from Reddit
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pollinations-MCP/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to search Reddit: ${response.statusText}`);
    }
    
    // Return the JSON response directly (thin proxy)
    return await response.json();
  } catch (error) {
    console.error('Error searching Reddit:', error);
    throw error;
  }
}
