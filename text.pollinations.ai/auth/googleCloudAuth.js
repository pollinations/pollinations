import { execSync } from 'child_process';
import debug from 'debug';

const log = debug('pollinations:google-auth');
const errorLog = debug('pollinations:google-auth:error');

// Global variable to store the Google Cloud access token
let gcloudAccessToken = '';

/**
 * Refreshes the Google Cloud access token using service account credentials
 * @returns {string} The new access token
 */
export function refreshGcloudAccessToken() {
    try {
        log('Refreshing Google Cloud access token');
        
        // Create an environment object that includes the credentials path
        const env = {
            ...process.env,
            GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
        };
        
        // Pass the environment to execSync
        const token = execSync('gcloud auth print-access-token', { env }).toString().trim();
        gcloudAccessToken = token;
        log('Successfully refreshed Google Cloud access token using service account credentials');
        return token;
    } catch (error) {
        errorLog('Failed to refresh Google Cloud access token:', error);
        return gcloudAccessToken; // Return the existing token if refresh fails
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary
 * @returns {string} The current access token
 */
export function getGcloudAccessToken() {
    if (!gcloudAccessToken) {
        return refreshGcloudAccessToken();
    }
    return gcloudAccessToken;
}

/**
 * Initializes the Google Cloud authentication module
 * Sets up a timer to refresh the token periodically
 */
export function initGoogleCloudAuth() {
    // Initial token refresh
    refreshGcloudAccessToken();
    
    // Set up a timer to refresh the token every 50 minutes (3000000 ms)
    // Service account tokens typically last 60 minutes, so refresh before expiration
    const refreshInterval = setInterval(refreshGcloudAccessToken, 3000000);
    
    log('Google Cloud authentication initialized with refresh interval of 50 minutes');
    
    return {
        getToken: getGcloudAccessToken,
        refreshToken: refreshGcloudAccessToken,
        refreshInterval
    };
}

// Export a default initialized instance
export default initGoogleCloudAuth();
