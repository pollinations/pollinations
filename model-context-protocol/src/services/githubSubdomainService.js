/**
 * GitHub Subdomain Service for Model Context Protocol
 * 
 * This service provides tools for managing user subdomains on Pollinations.
 */

// Import the subdomain tools
import {
  githubListSubdomains,
  githubRegisterSubdomain,
  githubUpdateSubdomain,
  githubDeleteSubdomain,
  githubGetSubdomainStatus
} from '../tools/github-subdomain-tools.js';

// Define the GitHub subdomain tools with their schemas and handlers
export const githubSubdomainTools = [
  // List subdomains
  [
    'githubListSubdomains',
    {
      description: 'List all subdomains for the authenticated user',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'User\'s authentication token'
          },
          userId: {
            type: 'string',
            description: 'User\'s ID'
          }
        },
        required: ['token', 'userId']
      }
    },
    async (params) => {
      try {
        return await githubListSubdomains(params);
      } catch (error) {
        throw new Error(`Failed to list subdomains: ${error.message}`);
      }
    }
  ],
  
  // Register subdomain
  [
    'githubRegisterSubdomain',
    {
      description: 'Register a new subdomain for the authenticated user',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'User\'s authentication token'
          },
          userId: {
            type: 'string',
            description: 'User\'s ID'
          },
          subdomain: {
            type: 'string',
            description: 'Subdomain name to register (e.g., "myproject" for myproject.pollinations.ai)'
          },
          source: {
            type: 'string',
            enum: ['github_pages', 'custom'],
            description: 'Source type for the subdomain content'
          },
          repo: {
            type: 'string',
            description: 'GitHub repository (username/repo) for github_pages source'
          },
          customDomain: {
            type: 'boolean',
            description: 'Whether a custom domain is used',
            default: false
          }
        },
        required: ['token', 'userId', 'subdomain', 'source']
      }
    },
    async (params) => {
      try {
        return await githubRegisterSubdomain(params);
      } catch (error) {
        throw new Error(`Failed to register subdomain: ${error.message}`);
      }
    }
  ],
  
  // Update subdomain
  [
    'githubUpdateSubdomain',
    {
      description: 'Update an existing subdomain',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'User\'s authentication token'
          },
          userId: {
            type: 'string',
            description: 'User\'s ID'
          },
          subdomain: {
            type: 'string',
            description: 'Subdomain name to update'
          },
          source: {
            type: 'string',
            enum: ['github_pages', 'custom'],
            description: 'Source type for the subdomain content'
          },
          repo: {
            type: 'string',
            description: 'GitHub repository (username/repo)'
          },
          customDomain: {
            type: 'boolean',
            description: 'Whether a custom domain is used'
          }
        },
        required: ['token', 'userId', 'subdomain']
      }
    },
    async (params) => {
      try {
        return await githubUpdateSubdomain(params);
      } catch (error) {
        throw new Error(`Failed to update subdomain: ${error.message}`);
      }
    }
  ],
  
  // Delete subdomain
  [
    'githubDeleteSubdomain',
    {
      description: 'Delete a subdomain',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'User\'s authentication token'
          },
          userId: {
            type: 'string',
            description: 'User\'s ID'
          },
          subdomain: {
            type: 'string',
            description: 'Subdomain name to delete'
          }
        },
        required: ['token', 'userId', 'subdomain']
      }
    },
    async (params) => {
      try {
        return await githubDeleteSubdomain(params);
      } catch (error) {
        throw new Error(`Failed to delete subdomain: ${error.message}`);
      }
    }
  ],
  
  // Get subdomain status
  [
    'githubGetSubdomainStatus',
    {
      description: 'Get subdomain status',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'User\'s authentication token'
          },
          userId: {
            type: 'string',
            description: 'User\'s ID'
          },
          subdomain: {
            type: 'string',
            description: 'Subdomain name to check'
          }
        },
        required: ['token', 'userId', 'subdomain']
      }
    },
    async (params) => {
      try {
        return await githubGetSubdomainStatus(params);
      } catch (error) {
        throw new Error(`Failed to get subdomain status: ${error.message}`);
      }
    }
  ]
];