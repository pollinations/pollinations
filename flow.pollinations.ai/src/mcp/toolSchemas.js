/**
 * Tool schemas for Pollinations Flow MCP Server
 */

/**
 * Authentication Tool Schemas
 */
export const authTools = [
  {
    name: 'isAuthenticated',
    description: 'Check if a user is authenticated',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID or token to check'
        }
      },
      required: ['sessionId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        authenticated: {
          type: 'boolean',
          description: 'Whether the user is authenticated'
        }
      },
      required: ['authenticated']
    }
  },
  {
    name: 'getAuthUrl',
    description: 'Get a URL to authenticate with GitHub',
    inputSchema: {
      type: 'object',
      properties: {
        returnUrl: {
          type: 'string',
          description: 'URL to redirect to after authentication'
        }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        authUrl: {
          type: 'string',
          description: 'URL to authenticate with GitHub'
        }
      },
      required: ['authUrl']
    }
  },
  {
    name: 'getToken',
    description: 'Get the Pollinations token for an authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID or token to use'
        }
      },
      required: ['sessionId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'The Pollinations token'
        }
      },
      required: ['token']
    }
  }
];

/**
 * Referrer Management Tool Schemas
 */
export const referrerTools = [
  {
    name: 'listReferrers',
    description: 'List authorized referrers for an authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID or token to use'
        }
      },
      required: ['sessionId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        referrers: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of authorized referrer domains'
        }
      },
      required: ['referrers']
    }
  },
  {
    name: 'addReferrer',
    description: 'Add a referrer to the authorized list for an authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID or token to use'
        },
        referrer: {
          type: 'string',
          description: 'The referrer domain to add'
        }
      },
      required: ['sessionId', 'referrer']
    },
    outputSchema: {
      type: 'object',
      properties: {
        referrers: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Updated list of authorized referrer domains'
        }
      },
      required: ['referrers']
    }
  },
  {
    name: 'removeReferrer',
    description: 'Remove a referrer from the authorized list for an authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID or token to use'
        },
        referrer: {
          type: 'string',
          description: 'The referrer domain to remove'
        }
      },
      required: ['sessionId', 'referrer']
    },
    outputSchema: {
      type: 'object',
      properties: {
        referrers: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Updated list of authorized referrer domains'
        }
      },
      required: ['referrers']
    }
  }
];

/**
 * Get all tool schemas
 */
export function getAllToolSchemas() {
  return [
    ...authTools,
    ...referrerTools
  ];
}
