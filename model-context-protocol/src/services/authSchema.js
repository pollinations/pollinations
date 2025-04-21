/**
 * Schema definitions for GitHub authentication service
 */

/**
 * Schema for the isAuthenticated tool
 */
export const isAuthenticatedSchema = {
  name: 'isAuthenticated',
  description: 'Check if a session is authenticated with GitHub',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to check authentication for'
      }
    },
    required: ['sessionId']
  }
};

/**
 * Schema for the getAuthUrl tool
 */
export const getAuthUrlSchema = {
  name: 'getAuthUrl',
  description: 'Get the GitHub OAuth URL for authentication',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

/**
 * Schema for the getToken tool
 */
export const getTokenSchema = {
  name: 'getToken',
  description: 'Get or generate a personal access token for the authenticated user',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID of the authenticated user'
      }
    },
    required: ['sessionId']
  }
};

/**
 * Schema for the verifyToken tool
 */
export const verifyTokenSchema = {
  name: 'verifyToken',
  description: 'Verify a Pollinations access token',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Pollinations access token to verify'
      }
    },
    required: ['token']
  }
};

/**
 * Schema for the listReferrers tool
 */
export const listReferrersSchema = {
  name: 'listReferrers',
  description: 'List authorized referrers for a user',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID of the authenticated user'
      }
    },
    required: ['sessionId']
  }
};

/**
 * Schema for the addReferrer tool
 */
export const addReferrerSchema = {
  name: 'addReferrer',
  description: 'Add a referrer to a user\'s whitelist',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID of the authenticated user'
      },
      referrer: {
        type: 'string',
        description: 'The domain to add to the whitelist (e.g. text.pollinations.ai)'
      }
    },
    required: ['sessionId', 'referrer']
  }
};

/**
 * Schema for the removeReferrer tool
 */
export const removeReferrerSchema = {
  name: 'removeReferrer',
  description: 'Remove a referrer from a user\'s whitelist',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID of the authenticated user'
      },
      referrer: {
        type: 'string',
        description: 'The domain to remove from the whitelist'
      }
    },
    required: ['sessionId', 'referrer']
  }
};
