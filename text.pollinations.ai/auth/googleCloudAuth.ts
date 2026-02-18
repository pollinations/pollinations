import debug from "debug";
import fetch from "node-fetch";

const log = debug("pollinations:google-auth");
const errorLog = debug("pollinations:google-auth:error");

interface ServiceAccountKey {
    type: string;
    project_id: string | undefined;
    private_key_id: string;
    private_key: string;
    client_email: string;
}

interface AuthInstance {
    getAccessToken: () => Promise<string | null>;
    cleanup?: () => void;
}

let gcloudAccessToken: string | null = null;
let tokenExpiration: number | null = null;

/**
 * Refreshes the Google Cloud access token using environment variables.
 */
async function refreshGcloudAccessToken(): Promise<string | null> {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const privateKeyId = process.env.GOOGLE_PRIVATE_KEY_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const projectId = process.env.GOOGLE_PROJECT_ID;

    log("Checking Google Cloud credentials from environment...");
    log("- GOOGLE_PRIVATE_KEY:", privateKey ? "[SET]" : "[NOT SET]");
    log("- GOOGLE_PRIVATE_KEY_ID:", privateKeyId ? "[SET]" : "[NOT SET]");
    log("- GOOGLE_CLIENT_EMAIL:", clientEmail ? "[SET]" : "[NOT SET]");
    log("- GOOGLE_PROJECT_ID:", projectId);

    if (!privateKey || !privateKeyId || !clientEmail) {
        errorLog(
            "Missing required Google Cloud credentials. Need: GOOGLE_PRIVATE_KEY, GOOGLE_PRIVATE_KEY_ID, GOOGLE_CLIENT_EMAIL",
        );
        return null;
    }

    const keyData: ServiceAccountKey = {
        type: "service_account",
        project_id: projectId,
        private_key_id: privateKeyId,
        private_key: privateKey.replace(/\\n/g, "\n"),
        client_email: clientEmail,
    };

    log("Service account credentials loaded from environment");
    log("Project ID:", keyData.project_id);
    log("Client email:", keyData.client_email);

    const token = await generateJwtToken(keyData);
    if (!token) return null;

    const accessToken = await exchangeJwtForAccessToken(token);
    if (!accessToken) return null;

    log("Successfully authenticated using service account key");
    return accessToken;
}

/**
 * Generate a JWT token from service account credentials.
 */
async function generateJwtToken(
    keyData: ServiceAccountKey,
): Promise<string | null> {
    try {
        const jwt = (await import("jsonwebtoken")).default;

        const now = Math.floor(Date.now() / 1000);

        const header = {
            alg: "RS256" as const,
            typ: "JWT" as const,
            kid: keyData.private_key_id,
        };

        const payload = {
            iss: keyData.client_email,
            sub: keyData.client_email,
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
            scope: "https://www.googleapis.com/auth/cloud-platform",
        };

        const signedJwt = jwt.sign(payload, keyData.private_key, {
            header,
            algorithm: "RS256",
        });

        log("JWT token generated successfully");
        return signedJwt;
    } catch (error) {
        errorLog("Failed to generate JWT token:", error);
        return null;
    }
}

/**
 * Exchange a JWT token for a Google Cloud access token.
 */
async function exchangeJwtForAccessToken(jwt: string): Promise<string | null> {
    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt,
            }),
        });

        log("Response status:", response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            errorLog(
                `Failed to exchange JWT for access token: ${response.status} ${response.statusText} - ${errorText}`,
            );
            return null;
        }

        const data = (await response.json()) as {
            access_token?: string;
            expires_in?: number;
        };

        if (!data.access_token) {
            errorLog("Response did not contain an access token:", data);
            return null;
        }

        log("Token response received with expires_in:", data.expires_in);
        return data.access_token;
    } catch (error) {
        errorLog("Error exchanging JWT for access token:", error);
        return null;
    }
}

/**
 * Returns the current Google Cloud access token, refreshing it if necessary.
 */
async function getGcloudAccessToken(): Promise<string | null> {
    if (
        !gcloudAccessToken ||
        !tokenExpiration ||
        Date.now() >= tokenExpiration
    ) {
        log("Token missing or expired, refreshing...");
        gcloudAccessToken = await refreshGcloudAccessToken();
        // Refresh at 50 minutes (tokens last 60 minutes)
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
}

const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

/**
 * Initializes Google Cloud authentication with periodic token refresh.
 */
function initGoogleCloudAuth(): AuthInstance {
    log("Initializing Google Cloud authentication...");

    if (!process.env.GOOGLE_PRIVATE_KEY) {
        log("GOOGLE_PRIVATE_KEY not set, returning null token provider");
        return { getAccessToken: async () => null };
    }

    // Eagerly refresh token but don't fail initialization
    getGcloudAccessToken().catch((error) => {
        errorLog("Failed to initialize Google Cloud authentication:", error);
    });

    const intervalId = setInterval(() => {
        log("Refreshing Google Cloud access token");
        getGcloudAccessToken().catch((error) => {
            errorLog("Failed to refresh Google Cloud access token:", error);
        });
    }, TOKEN_REFRESH_INTERVAL);

    return {
        getAccessToken: getGcloudAccessToken,
        cleanup: () => {
            clearInterval(intervalId);
            log("Google Cloud authentication timer cleared");
        },
    };
}

let authInstance: AuthInstance | null = null;

function getAuthInstance(): AuthInstance {
    if (!authInstance) {
        authInstance = initGoogleCloudAuth();
    }
    return authInstance;
}

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
    },
};
