import fetch from "node-fetch";
import fs from "fs/promises";
import debug from "debug";
import jwt from "jsonwebtoken";

const log = debug("pollinations:google-auth");
const errorLog = debug("pollinations:google-auth:error");

// Types
interface ServiceAccountKey {
    private_key: string;
    private_key_id: string;
    client_email: string;
    project_id: string;
}

interface JWTHeader {
    alg: string;
    typ: string;
    kid: string;
}

interface JWTPayload {
    iss: string;
    sub: string;
    aud: string;
    iat: number;
    exp: number;
    scope: string;
}

interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

interface AuthInstance {
    getAccessToken: () => Promise<string | null>;
    cleanup?: () => void;
}

// Global variable to store the Google Cloud access token
let gcloudAccessToken = "";
let tokenExpiration: number | null = null;

/**
 * Refreshes the Google Cloud access token using a service account key file
 * @returns A promise that resolves to the access token or null if authentication fails
 */
async function refreshGcloudAccessToken(): Promise<string | null> {
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
        let keyFileContent: string;
        try {
            keyFileContent = await fs.readFile(credentialsPath, "utf8");
        } catch (fileError) {
            errorLog("Failed to read service account key file:", fileError);
            return null;
        }

        let keyData: ServiceAccountKey;
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
        let token: string | null;
        try {
            token = await generateJwtToken(keyData);
            log("JWT token generated successfully");
        } catch (jwtError) {
            errorLog("Failed to generate JWT token:", jwtError);
            return null;
        }

        if (!token) {
            errorLog("JWT token generation returned null");
            return null;
        }

        // Exchange the JWT token for an access token
        log("Exchanging JWT for access token...");
        let accessToken: string | null;
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
 * @param keyData - The parsed service account key data
 * @returns A promise that resolves to the JWT token or null if generation fails
 */
async function generateJwtToken(keyData: ServiceAccountKey): Promise<string | null> {
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

        // Create the JWT header
        const header: JWTHeader = {
            alg: "RS256",
            typ: "JWT",
            kid: keyData.private_key_id,
        };
        // Log only non-sensitive header fields
        log("JWT header created with algorithm:", header.alg, "and key ID length:", header.kid.length);

        // Current time in seconds
        const now = Math.floor(Date.now() / 1000);

        // Create the JWT payload
        const payload: JWTPayload = {
            iss: keyData.client_email,
            sub: keyData.client_email,
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600, // Token expires in 1 hour
            scope: "https://www.googleapis.com/auth/cloud-platform",
        };
        // Log only non-sensitive payload fields
        log("JWT payload created with issuer:", payload.iss, "expires in:", payload.exp - payload.iat, "seconds");

        // Sign the JWT with the private key
        log("Signing JWT with private key...");
        let signedJwt: string;
        try {
            signedJwt = jwt.sign(payload, keyData.private_key, {
                header: header,
                algorithm: "RS256",
            });
            log("JWT signed successfully, length:", signedJwt.length);
        } catch (signError) {
            errorLog("Failed to sign JWT:", signError);
            return null;
        }

        return signedJwt;
    } catch (error) {
        errorLog("Error generating JWT token:", error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Exchange a JWT token for a Google Cloud access token
 * @param jwtToken - The JWT token
 * @returns A promise that resolves to the access token or null if exchange fails
 */
async function exchangeJwtForAccessToken(jwtToken: string): Promise<string | null> {
    try {
        // Make a request to the Google OAuth token endpoint
        log("Making request to Google OAuth token endpoint...");
        let response: any;
        try {
            response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    assertion: jwtToken,
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

        let data: TokenResponse;
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
        errorLog("Error exchanging JWT for access token:", error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary
 * @returns The current access token or null if authentication fails
 */
async function getGcloudAccessToken(): Promise<string | null> {
    try {
        // If we don't have a token or it's expired, refresh it
        if (
            !gcloudAccessToken ||
            !tokenExpiration ||
            Date.now() >= tokenExpiration
        ) {
            log("Token missing or expired, refreshing...");
            const newToken = await refreshGcloudAccessToken();
            if (newToken) {
                gcloudAccessToken = newToken;
                // Set expiration to 50 minutes from now (tokens typically last 60 minutes)
                tokenExpiration = Date.now() + 50 * 60 * 1000;
                log(
                    "Token refreshed, expires at:",
                    new Date(tokenExpiration).toISOString(),
                );
            } else {
                return null;
            }
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
 * @returns An object with getAccessToken method or null if initialization fails
 */
function initGoogleCloudAuth(): AuthInstance {
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
let authInstance: AuthInstance | null = null;

/**
 * Get the Google Cloud auth instance, initializing it lazily if needed
 * @returns The auth instance with getAccessToken method
 */
function getAuthInstance(): AuthInstance {
    if (!authInstance) {
        authInstance = initGoogleCloudAuth();
    }
    return authInstance;
}

// Export the lazy getter instead of an immediately initialized instance
export default {
    getAccessToken: async (): Promise<string | null> => {
        const instance = getAuthInstance();
        return await instance.getAccessToken();
    },
    cleanup: (): void => {
        const instance = getAuthInstance();
        if (instance.cleanup) {
            instance.cleanup();
        }
    }
};
