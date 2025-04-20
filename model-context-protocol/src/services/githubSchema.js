/**
 * Schema definitions for GitHub authentication and token management tools
 */

/**
 * Schema for githubIsAuthenticated tool
 */
export const githubIsAuthenticatedSchema = {
  type: 'function',
  function: {
    name: 'githubIsAuthenticated',
    description: 'Check if the user has a valid GitHub authentication',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to check authentication status'
        }
      }
    }
  }
};

/**
 * Schema for githubGetAuthUrl tool
 */
export const githubGetAuthUrlSchema = {
  type: 'function',
  function: {
    name: 'githubGetAuthUrl',
    description: 'Get a URL for GitHub authentication',
    parameters: {
      type: 'object',
      properties: {
        returnUrl: {
          type: 'string',
          description: 'URL to return to after authentication'
        }
      }
    }
  }
};

/**
 * Schema for githubGetToken tool
 */
export const githubGetTokenSchema = {
  type: 'function',
  function: {
    name: 'githubGetToken',
    description: 'Get a Pollinations token for a user',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID of the authenticated user'
        }
      },
      required: ['sessionId']
    }
  }
};

/**
 * Schema for githubListReferrers tool
 */
export const githubListReferrersSchema = {
  type: 'function',
  function: {
    name: 'githubListReferrers',
    description: 'List authorized referrers for a user',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID of the authenticated user'
        }
      },
      required: ['sessionId']
    }
  }
};

/**
 * Schema for githubAddReferrer tool
 */
export const githubAddReferrerSchema = {
  type: 'function',
  function: {
    name: 'githubAddReferrer',
    description: 'Add a referrer to a user\'s whitelist',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID of the authenticated user'
        },
        referrer: {
          type: 'string',
          description: 'Referrer to add to whitelist'
        }
      },
      required: ['sessionId', 'referrer']
    }
  }
};

/**
 * Schema for githubRemoveReferrer tool
 */
export const githubRemoveReferrerSchema = {
  type: 'function',
  function: {
    name: 'githubRemoveReferrer',
    description: 'Remove a referrer from a user\'s whitelist',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID of the authenticated user'
        },
        referrer: {
          type: 'string',
          description: 'Referrer to remove from whitelist'
        }
      },
      required: ['sessionId', 'referrer']
    }
  }
};

/**
 * All GitHub tool schemas
 */
export const githubToolSchemas = [
  githubIsAuthenticatedSchema,
  githubGetAuthUrlSchema,
  githubGetTokenSchema,
  githubListReferrersSchema,
  githubAddReferrerSchema,
  githubRemoveReferrerSchema
];

export default githubToolSchemas;
