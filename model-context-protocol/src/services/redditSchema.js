/**
 * Schema definitions for the Pollinations Reddit API
 */

/**
 * Schema for the getRedditSubredditPosts tool
 */
export const getRedditSubredditPostsSchema = {
  name: 'getRedditSubredditPosts',
  description: 'Get posts from a subreddit with various filters',
  inputSchema: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: 'The subreddit name (without r/)'
      },
      listing: {
        type: 'string',
        description: 'Type of listing (hot, new, top, rising, controversial)',
        enum: ['hot', 'new', 'top', 'rising', 'controversial']
      },
      limit: {
        type: 'number',
        description: 'Number of posts to retrieve (max 100)'
      },
      timeframe: {
        type: 'string',
        description: 'Time frame for top/controversial listings (hour, day, week, month, year, all)',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all']
      }
    },
    required: ['subreddit']
  }
};

/**
 * Schema for the getRedditPostAndComments tool
 */
export const getRedditPostAndCommentsSchema = {
  name: 'getRedditPostAndComments',
  description: 'Get a specific post and its comments',
  inputSchema: {
    type: 'object',
    properties: {
      postId: {
        type: 'string',
        description: 'The Reddit post ID'
      },
      subreddit: {
        type: 'string',
        description: 'The subreddit name (without r/)'
      }
    },
    required: ['postId', 'subreddit']
  }
};

/**
 * Schema for the getRedditUserPosts tool
 */
export const getRedditUserPostsSchema = {
  name: 'getRedditUserPosts',
  description: 'Get posts from a specific Reddit user',
  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'The Reddit username (without u/)'
      },
      listing: {
        type: 'string',
        description: 'Type of listing (overview, submitted, comments, gilded, upvoted, downvoted, hidden, saved)',
        enum: ['overview', 'submitted', 'comments', 'gilded', 'upvoted', 'downvoted', 'hidden', 'saved']
      },
      limit: {
        type: 'number',
        description: 'Number of posts to retrieve (max 100)'
      }
    },
    required: ['username']
  }
};

/**
 * Schema for the searchReddit tool
 */
export const searchRedditSchema = {
  name: 'searchReddit',
  description: 'Search across Reddit or within a subreddit',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      subreddit: {
        type: 'string',
        description: 'The subreddit to search within (null for all of Reddit)'
      },
      limit: {
        type: 'number',
        description: 'Number of results to retrieve (max 100)'
      },
      sort: {
        type: 'string',
        description: 'Sort method (relevance, hot, new, top, comments)',
        enum: ['relevance', 'hot', 'new', 'top', 'comments']
      }
    },
    required: ['query']
  }
};
