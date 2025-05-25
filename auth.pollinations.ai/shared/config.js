/**
 * Shared configuration loader for Pollinations services
 * Loads configuration from environment variables only
 * No hardcoded values are stored in this file
 */

// Get whitelisted domains from environment
export const getWhitelistedDomains = () => {
  const domains = process.env.WHITELISTED_DOMAINS || '';
  return domains.split(',').map(d => d.trim()).filter(Boolean);
};

// Get valid tokens from environment
export const getValidTokens = () => {
  const tokens = process.env.VALID_TOKENS || '';
  return tokens.split(',').map(t => t.trim()).filter(Boolean);
};

// Get all approved clients (domains + tokens)
export const getApprovedClients = () => {
  const domains = getWhitelistedDomains();
  const tokens = getValidTokens();
  return [...new Set([...domains, ...tokens])];
};

// Check if a client (domain or token) is approved
export const isApprovedClient = (client) => {
  if (!client) return false;
  const approved = getApprovedClients();
  return approved.includes(client);
};

// Get shared password from environment
export const getFeedPassword = () => {
  return process.env.FEED_PASSWORD || '';
};
