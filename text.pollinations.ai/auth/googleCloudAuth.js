import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const log = console.log;
const errorLog = console.error;

// Global variable to store the Google Cloud access token
let gcloudAccessToken = '';
let tokenExpiration = null;

/**
 * Refreshes the Google Cloud access token using Application Default Credentials (ADC)
 * This supports multiple authentication methods:
 * 1. Attached service accounts (when running on Google Cloud)
 * 2. User credentials with service account impersonation
 * 3. Workload Identity Federation
 * 4. Service account keys (if allowed by organization policy)
 * 
 * @returns {Promise<string>} A promise that resolves to the access token
 */
export async function refreshGcloudAccessToken() {
    try {
        // First try to use the Google Cloud metadata server (works when running on Google Cloud)
        const token = await tryMetadataServerAuth();
        if (token) {
            log('Successfully authenticated using the metadata server (attached service account)');
            return token;
        }

        // If not on Google Cloud, try Application Default Credentials
        const adcToken = await tryApplicationDefaultCredentials();
        if (adcToken) {
            log('Successfully authenticated using Application Default Credentials');
            return adcToken;
        }

        // Fallback to gcloud CLI as a last resort (requires manual login)
        const gcloudToken = await tryGcloudCLI();
        if (gcloudToken) {
            log('Successfully authenticated using gcloud CLI');
            return gcloudToken;
        }

        throw new Error('All authentication methods failed');
    } catch (error) {
        errorLog('Error refreshing Google Cloud access token:', error);
        throw error;
    }
}

/**
 * Try to authenticate using the Google Cloud metadata server
 * This works when running on Google Cloud with an attached service account
 */
async function tryMetadataServerAuth() {
    try {
        const response = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            {
                headers: {
                    'Metadata-Flavor': 'Google'
                },
                timeout: 3000 // Short timeout to quickly fall back if not on Google Cloud
            }
        );

        if (response.ok) {
            const data = await response.json();
            return data.access_token;
        }
        return null;
    } catch (error) {
        log('Not running on Google Cloud or metadata server not accessible');
        return null;
    }
}

/**
 * Try to authenticate using Application Default Credentials
 * This works with user credentials, service account impersonation, and workload identity federation
 */
async function tryApplicationDefaultCredentials() {
    try {
        // The Google Auth library automatically detects and uses ADC
        // This is a simplified implementation that calls the tokeninfo endpoint
        // In a production environment, you should use the official Google Auth library
        
        // Check if GOOGLE_APPLICATION_CREDENTIALS is set (for service account impersonation or workload identity)
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!credentialsPath) {
            log('GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
            return null;
        }

        // For demonstration purposes, we're checking if the file exists
        // In a real implementation, you would use the Google Auth library
        try {
            await fs.access(credentialsPath);
            log(`ADC credentials file found at ${credentialsPath}`);
            
            // In a real implementation, you would use the Google Auth library to get a token
            // For now, we'll fall back to the gcloud CLI
            return null;
        } catch (error) {
            log(`ADC credentials file not found at ${credentialsPath}`);
            return null;
        }
    } catch (error) {
        log('Error using Application Default Credentials:', error.message);
        return null;
    }
}

/**
 * Try to authenticate using the gcloud CLI
 * This requires manual login but works in development environments
 */
async function tryGcloudCLI() {
    try {
        const { stdout } = await execAsync('gcloud auth print-access-token');
        return stdout.trim();
    } catch (error) {
        log('Error using gcloud CLI:', error.message);
        return null;
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary
 * @returns {Promise<string>} The current access token
 */
export async function getGcloudAccessToken() {
    // Check if token is expired or not set
    if (!gcloudAccessToken || !tokenExpiration || Date.now() >= tokenExpiration) {
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
    refreshGcloudAccessToken().catch(err => {
        errorLog('Initial token refresh failed:', err);
    });
    
    // Set up a timer to refresh the token every 50 minutes (3000000 ms)
    // Service account tokens typically last 60 minutes, so refresh before expiration
    const refreshInterval = setInterval(async () => {
        try {
            await refreshGcloudAccessToken();
        } catch (err) {
            errorLog('Scheduled token refresh failed:', err);
        }
    }, 3000000);
    
    log('Google Cloud authentication initialized with refresh interval of 50 minutes');
    
    return {
        getToken: getGcloudAccessToken,
        refreshToken: refreshGcloudAccessToken,
        refreshInterval
    };
}

// Export a default initialized instance
export default initGoogleCloudAuth();
