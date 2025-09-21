import fetch from "node-fetch";
import fs from "fs/promises";
import debug from "debug";

const log = debug("pollinations:google-auth");
const errorLog = debug("pollinations:google-auth:error");

// Global variable to store the Google Cloud access token
let gcloudAccessToken = "";
let tokenExpiration = null;

/**
 * Refreshes the Google Cloud access token using a service account key file
 * @returns {Promise<string|null>} A promise that resolves to the access token or null if authentication fails
 */
async function refreshGcloudAccessToken() {
    try {
        // Get the path to the service account key file
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        log("GOOGLE_APPLICATION_CREDENTIALS path:", credentialsPath);

        if (!credentialsPath) {
            errorLog(
                "GOOGLE_APPLICATION_CREDENTIALS environment variable not set",
            );
            return null;
        }

        // Read and parse the service account key file
        log("Reading service account key file...");
        let keyFileContent;
        try {
            keyFileContent = await fs.readFile(credentialsPath, "utf8");
        } catch (fileError) {
            errorLog("Failed to read service account key file:", fileError);
            return null;
        }

        let keyData;
        try {
            keyData = JSON.parse(keyFileContent);
        } catch (parseError) {
            errorLog("Failed to parse service account key file:", parseError);
            return null;
        }

        log("Service account key file loaded successfully");
        log("Project ID:", keyData.project_id);
        log("Client email:", keyData.client_email);

        // Generate a JWT token
        log("Generating JWT token...");
        let token;
        try {
            token = await generateJwtToken(keyData);
            log("JWT token generated successfully");
        } catch (jwtError) {
            errorLog("Failed to generate JWT token:", jwtError);
            return null;
        }

        // Exchange the JWT token for an access token
        log("Exchanging JWT for access token...");
        let accessToken;
        try {
            accessToken = await exchangeJwtForAccessToken(token);
            log("Access token received successfully");
        } catch (tokenError) {
            errorLog("Failed to exchange JWT for access token:", tokenError);
            return null;
        }

        log("Successfully authenticated using service account key");
        return accessToken;
    } catch (error) {
        errorLog("Error refreshing Google Cloud access token:", error);
        return null;
    }
}

/**
 * Generate a JWT token from service account credentials
 * @param {Object} keyData - The parsed service account key data
 * @returns {Promise<string|null>} - A promise that resolves to the JWT token or null if generation fails
 */
async function generateJwtToken(keyData) {
    try {
        // Validate required fields in keyData
        if (
            !keyData.private_key ||
            !keyData.private_key_id ||
            !keyData.client_email
        ) {
            errorLog("Missing required fields in service account key data");
            return null;
        }

        // Import the jsonwebtoken library
        log("Importing jsonwebtoken library...");
        let jwt;
        try {
            jwt = (await import("jsonwebtoken")).default;
        } catch (importError) {
            errorLog("Failed to import jsonwebtoken library:", importError);
            return null;
        }

        // Create the JWT header
        const header = {
            alg: "RS256",
            typ: "JWT",
            kid: keyData.private_key_id,
        };
        log("JWT header created:", JSON.stringify(header));

        // Current time in seconds
        const now = Math.floor(Date.now() / 1000);

        // Create the JWT payload
        const payload = {
            iss: keyData.client_email,
            sub: keyData.client_email,
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600, // Token expires in 1 hour
            scope: "https://www.googleapis.com/auth/cloud-platform",
        };
        log("JWT payload created:", JSON.stringify(payload));

        // Sign the JWT with the private key
        log("Signing JWT with private key...");
        let signedJwt;
        try {
            signedJwt = jwt.sign(payload, keyData.private_key, {
                header: header,
                algorithm: "RS256",
            });
            log("JWT signed successfully");
        } catch (signError) {
            errorLog("Failed to sign JWT:", signError);
            return null;
        }

        return signedJwt;
    } catch (error) {
        errorLog("Error generating JWT token:", error.message);
        return null;
    }
}

/**
 * Exchange a JWT token for a Google Cloud access token
 * @param {string} jwt - The JWT token
 * @returns {Promise<string|null>} - A promise that resolves to the access token or null if exchange fails
 */
async function exchangeJwtForAccessToken(jwt) {
    try {
        // Make a request to the Google OAuth token endpoint
        log("Making request to Google OAuth token endpoint...");
        let response;
        try {
            response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    assertion: jwt,
                }),
            });
        } catch (fetchError) {
            errorLog(
                "Network error when contacting Google OAuth endpoint:",
                fetchError,
            );
            return null;
        }

        log("Response status:", response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            log("Error response body:", errorText);
            errorLog(
                `Failed to exchange JWT for access token: ${response.status} ${response.statusText} - ${errorText}`,
            );
            return null;
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            errorLog("Failed to parse response as JSON:", jsonError);
            return null;
        }

        if (!data.access_token) {
            errorLog("Response did not contain an access token:", data);
            return null;
        }

        log("Token response received with expires_in:", data.expires_in);
        return data.access_token;
    } catch (error) {
        errorLog("Error exchanging JWT for access token:", error.message);
        return null;
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary
 * @returns {Promise<string|null>} The current access token or null if authentication fails
 */
async function getGcloudAccessToken() {
    try {
        // If we don't have a token or it's expired, refresh it
        if (
            !gcloudAccessToken ||
            !tokenExpiration ||
            Date.now() >= tokenExpiration
        ) {
            log("Token missing or expired, refreshing...");
            gcloudAccessToken = await refreshGcloudAccessToken();
            // Set expiration to 50 minutes from now (tokens typically last 60 minutes)
            tokenExpiration = Date.now() + 50 * 60 * 1000;
            log(
                "Token refreshed, expires at:",
                new Date(tokenExpiration).toISOString(),
            );
        } else {
            log(
                "Using existing token, expires at:",
                new Date(tokenExpiration).toISOString(),
            );
        }
        return gcloudAccessToken;
    } catch (error) {
        errorLog("Failed to get Google Cloud access token:", error);
        return null;
    }
}

/**
 * Initializes the Google Cloud authentication module
 * Sets up a timer to refresh the token periodically
 * @returns {Object|null} An object with getAccessToken method or null if initialization fails
 */
function initGoogleCloudAuth() {
    try {
        log("Initializing Google Cloud authentication...");
        log("Environment variables:");
        log(
            "- GOOGLE_APPLICATION_CREDENTIALS:",
            process.env.GOOGLE_APPLICATION_CREDENTIALS,
        );
        log("- GCLOUD_PROJECT_ID:", process.env.GCLOUD_PROJECT_ID);

        // Check if credentials are available
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            log("GOOGLE_APPLICATION_CREDENTIALS not set, returning null");
            return {
                getAccessToken: async () => null,
            };
        }

        // Try to refresh the token immediately but don't fail if it doesn't work
        getGcloudAccessToken().catch((error) => {
            errorLog(
                "Failed to initialize Google Cloud authentication:",
                error,
            );
            // We'll still continue and try again later
        });

        // Set up a timer to refresh the token every 50 minutes
        const intervalId = setInterval(
            () => {
                log("Refreshing Google Cloud access token");
                getGcloudAccessToken().catch((error) => {
                    errorLog(
                        "Failed to refresh Google Cloud access token:",
                        error,
                    );
                });
            },
            50 * 60 * 1000,
        );

        // Return the getGcloudAccessToken function for convenience
        return {
            getAccessToken: getGcloudAccessToken,
            // Add a cleanup method to clear the interval if needed
            cleanup: () => {
                clearInterval(intervalId);
                log("Google Cloud authentication timer cleared");
            },
        };
    } catch (error) {
        errorLog("Failed to initialize Google Cloud authentication:", error);
        // Return a dummy object that returns null for getAccessToken
        return {
            getAccessToken: async () => null,
        };
    }
}

// Global instance variable for lazy initialization
let authInstance = null;

/**
 * Get the Google Cloud auth instance, initializing it lazily if needed
 * @returns {Object} The auth instance with getAccessToken method
 */
function getAuthInstance() {
    if (!authInstance) {
        authInstance = initGoogleCloudAuth();
    }
    return authInstance;
}

// Export the lazy getter instead of an immediately initialized instance
export default {
    getAccessToken: async () => {
        const instance = getAuthInstance();
        return await instance.getAccessToken();
    },
    cleanup: () => {
        const instance = getAuthInstance();
        if (instance.cleanup) {
            instance.cleanup();
        }
    }
};
