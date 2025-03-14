import fetch from 'node-fetch';
import fs from 'fs/promises';
import debug from 'debug';

const log = debug('pollinations:google-auth');
const errorLog = debug('pollinations:google-auth:error');

// Global variable to store the Google Cloud access token
let gcloudAccessToken = '';
let tokenExpiration = null;

/**
 * Refreshes the Google Cloud access token using a service account key file
 * @returns {Promise<string>} A promise that resolves to the access token
 */
export async function refreshGcloudAccessToken() {
    try {
        // Get the path to the service account key file
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        log('GOOGLE_APPLICATION_CREDENTIALS path:', credentialsPath);
        
        if (!credentialsPath) {
            throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
        }

        // Read and parse the service account key file
        log('Reading service account key file...');
        const keyFileContent = await fs.readFile(credentialsPath, 'utf8');
        const keyData = JSON.parse(keyFileContent);
        log('Service account key file loaded successfully');
        log('Project ID:', keyData.project_id);
        log('Client email:', keyData.client_email);
        
        // Generate a JWT token
        log('Generating JWT token...');
        const token = await generateJwtToken(keyData);
        log('JWT token generated successfully');
        
        // Exchange the JWT token for an access token
        log('Exchanging JWT for access token...');
        const accessToken = await exchangeJwtForAccessToken(token);
        log('Access token received successfully');
        
        log('Successfully authenticated using service account key');
        return accessToken;
    } catch (error) {
        errorLog('Error refreshing Google Cloud access token:', error);
        throw error;
    }
}

/**
 * Generate a JWT token from service account credentials
 * @param {Object} keyData - The parsed service account key data
 * @returns {Promise<string>} - A promise that resolves to the JWT token
 */
async function generateJwtToken(keyData) {
    try {
        // Import the jsonwebtoken library
        log('Importing jsonwebtoken library...');
        const jwt = (await import('jsonwebtoken')).default;
        
        // Create the JWT header
        const header = {
            alg: 'RS256',
            typ: 'JWT',
            kid: keyData.private_key_id
        };
        log('JWT header created:', JSON.stringify(header));
        
        // Current time in seconds
        const now = Math.floor(Date.now() / 1000);
        
        // Create the JWT payload
        const payload = {
            iss: keyData.client_email,
            sub: keyData.client_email,
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600, // Token expires in 1 hour
            scope: 'https://www.googleapis.com/auth/cloud-platform'
        };
        log('JWT payload created:', JSON.stringify(payload));
        
        // Sign the JWT with the private key
        log('Signing JWT with private key...');
        const signedJwt = jwt.sign(payload, keyData.private_key, { 
            header: header,
            algorithm: 'RS256'
        });
        log('JWT signed successfully');
        
        return signedJwt;
    } catch (error) {
        log('Error generating JWT token:', error.message);
        throw error;
    }
}

/**
 * Exchange a JWT token for a Google Cloud access token
 * @param {string} jwt - The JWT token
 * @returns {Promise<string>} - A promise that resolves to the access token
 */
async function exchangeJwtForAccessToken(jwt) {
    try {
        // Make a request to the Google OAuth token endpoint
        log('Making request to Google OAuth token endpoint...');
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            })
        });
        
        log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            log('Error response body:', errorText);
            throw new Error(`Failed to exchange JWT for access token: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        log('Token response received with expires_in:', data.expires_in);
        return data.access_token;
    } catch (error) {
        log('Error exchanging JWT for access token:', error.message);
        throw error;
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary
 * @returns {Promise<string>} The current access token
 */
export async function getGcloudAccessToken() {
    // If we don't have a token or it's expired, refresh it
    if (!gcloudAccessToken || !tokenExpiration || Date.now() >= tokenExpiration) {
        log('Token missing or expired, refreshing...');
        gcloudAccessToken = await refreshGcloudAccessToken();
        // Set expiration to 50 minutes from now (tokens typically last 60 minutes)
        tokenExpiration = Date.now() + 50 * 60 * 1000;
        log('Token refreshed, expires at:', new Date(tokenExpiration).toISOString());
    } else {
        log('Using existing token, expires at:', new Date(tokenExpiration).toISOString());
    }
    return gcloudAccessToken;
}

/**
 * Initializes the Google Cloud authentication module
 * Sets up a timer to refresh the token periodically
 */
export function initGoogleCloudAuth() {
    log('Initializing Google Cloud authentication...');
    log('Environment variables:');
    log('- GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    log('- GCLOUD_PROJECT_ID:', process.env.GCLOUD_PROJECT_ID);
    
    // Refresh the token immediately
    getGcloudAccessToken().catch(error => {
        errorLog('Failed to initialize Google Cloud authentication:', error);
    });

    // Set up a timer to refresh the token every 50 minutes
    setInterval(() => {
        log('Refreshing Google Cloud access token');
        getGcloudAccessToken().catch(error => {
            errorLog('Failed to refresh Google Cloud access token:', error);
        });
    }, 50 * 60 * 1000);

    // Return the getGcloudAccessToken function for convenience
    return {
        getAccessToken: getGcloudAccessToken
    };
}

// Export a default initialized instance
export default initGoogleCloudAuth();
