/**
 * GitHub Subdomain Management Tools for Model Context Protocol
 * 
 * These tools allow AI models to manage user subdomains on Pollinations.
 * They integrate with the GitHub authentication system and provide
 * a way for users to register and manage their own Pollinations subdomains.
 */

// Import required modules
const { fetchWithAuth } = require('../utils/auth-utils');

/**
 * List all subdomains for the authenticated user
 * @param {Object} params - Parameters object
 * @param {string} params.token - User's authentication token
 * @param {string} params.userId - User's ID
 * @returns {Promise<Object>} - List of user's subdomains
 */
async function githubListSubdomains({ token, userId }) {
  if (!token || !userId) {
    throw new Error('Missing required parameters: token and userId');
  }

  try {
    const response = await fetchWithAuth(
      `https://auth.pollinations.ai/github/subdomains/list?user_id=${userId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to list subdomains: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing subdomains:', error);
    throw error;
  }
}

/**
 * Register a new subdomain for the authenticated user
 * @param {Object} params - Parameters object
 * @param {string} params.token - User's authentication token
 * @param {string} params.userId - User's ID
 * @param {string} params.subdomain - Subdomain name to register
 * @param {string} params.source - Source type (github_pages, custom)
 * @param {string} [params.repo] - GitHub repository (username/repo) for github_pages source
 * @param {boolean} [params.customDomain] - Whether a custom domain is used
 * @returns {Promise<Object>} - The newly registered subdomain
 */
async function githubRegisterSubdomain({ token, userId, subdomain, source, repo, customDomain = false }) {
  if (!token || !userId || !subdomain || !source) {
    throw new Error('Missing required parameters: token, userId, subdomain, and source');
  }

  if (source === 'github_pages' && !repo) {
    throw new Error('GitHub repository is required for GitHub Pages source');
  }

  try {
    const response = await fetchWithAuth(
      `https://auth.pollinations.ai/github/subdomains/register?user_id=${userId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subdomain,
          source,
          repo,
          custom_domain: customDomain
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to register subdomain: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error registering subdomain:', error);
    throw error;
  }
}

/**
 * Update an existing subdomain
 * @param {Object} params - Parameters object
 * @param {string} params.token - User's authentication token
 * @param {string} params.userId - User's ID
 * @param {string} params.subdomain - Subdomain name to update
 * @param {string} [params.source] - Source type (github_pages, custom)
 * @param {string} [params.repo] - GitHub repository (username/repo)
 * @param {boolean} [params.customDomain] - Whether a custom domain is used
 * @returns {Promise<Object>} - The updated subdomain
 */
async function githubUpdateSubdomain({ token, userId, subdomain, source, repo, customDomain }) {
  if (!token || !userId || !subdomain) {
    throw new Error('Missing required parameters: token, userId, and subdomain');
  }

  // Build update object with only provided fields
  const updateData = {};
  if (source !== undefined) updateData.source = source;
  if (repo !== undefined) updateData.repo = repo;
  if (customDomain !== undefined) updateData.custom_domain = customDomain;

  try {
    const response = await fetchWithAuth(
      `https://auth.pollinations.ai/github/subdomains/update/${subdomain}?user_id=${userId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to update subdomain: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating subdomain:', error);
    throw error;
  }
}

/**
 * Delete a subdomain
 * @param {Object} params - Parameters object
 * @param {string} params.token - User's authentication token
 * @param {string} params.userId - User's ID
 * @param {string} params.subdomain - Subdomain name to delete
 * @returns {Promise<Object>} - Success status
 */
async function githubDeleteSubdomain({ token, userId, subdomain }) {
  if (!token || !userId || !subdomain) {
    throw new Error('Missing required parameters: token, userId, and subdomain');
  }

  try {
    const response = await fetchWithAuth(
      `https://auth.pollinations.ai/github/subdomains/delete/${subdomain}?user_id=${userId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to delete subdomain: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting subdomain:', error);
    throw error;
  }
}

/**
 * Get subdomain status
 * @param {Object} params - Parameters object
 * @param {string} params.token - User's authentication token
 * @param {string} params.userId - User's ID
 * @param {string} params.subdomain - Subdomain name to check
 * @returns {Promise<Object>} - Subdomain status
 */
async function githubGetSubdomainStatus({ token, userId, subdomain }) {
  if (!token || !userId || !subdomain) {
    throw new Error('Missing required parameters: token, userId, and subdomain');
  }

  try {
    const response = await fetchWithAuth(
      `https://auth.pollinations.ai/github/subdomains/status/${subdomain}?user_id=${userId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to get subdomain status: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting subdomain status:', error);
    throw error;
  }
}

// Export all tools
module.exports = {
  githubListSubdomains,
  githubRegisterSubdomain,
  githubUpdateSubdomain,
  githubDeleteSubdomain,
  githubGetSubdomainStatus
};