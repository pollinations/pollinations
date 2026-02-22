// Shared configuration for BYOP authentication
export const STORAGE_KEY = "pollinations_api_key";
export const ENTER_URL = "https://enter.pollinations.ai";
export const DEFAULT_API_KEY = "plln_pk_EiFtGHYIeDMxNeZBqKaRFBEJQRardmel";

/**
 * Validates if a string is a valid Pollinations API key format
 * @param {string} token - The token to validate
 * @returns {boolean} True if valid format, false otherwise
 */
export const isValidApiKey = (token) => {
    return typeof token === "string" && /^(sk_|plln_pk_|pk_)/.test(token);
};
