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

/** Refresh tokens at 50 minutes (tokens last 60 minutes) */
const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

let cachedToken: string | null = null;
let tokenExpiration = 0;

async function refreshToken(): Promise<string | null> {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const privateKeyId = process.env.GOOGLE_PRIVATE_KEY_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const projectId = process.env.GOOGLE_PROJECT_ID;

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

    const jwt = await generateJwtToken(keyData);
    if (!jwt) return null;

    const accessToken = await exchangeJwtForAccessToken(jwt);
    if (!accessToken) return null;

    log("Successfully authenticated using service account key");
    return accessToken;
}

async function generateJwtToken(
    keyData: ServiceAccountKey,
): Promise<string | null> {
    try {
        const jwt = (await import("jsonwebtoken")).default;

        const now = Math.floor(Date.now() / 1000);

        const signedJwt = jwt.sign(
            {
                iss: keyData.client_email,
                sub: keyData.client_email,
                aud: "https://oauth2.googleapis.com/token",
                iat: now,
                exp: now + 3600,
                scope: "https://www.googleapis.com/auth/cloud-platform",
            },
            keyData.private_key,
            {
                header: {
                    alg: "RS256" as const,
                    typ: "JWT" as const,
                    kid: keyData.private_key_id,
                },
                algorithm: "RS256",
            },
        );

        return signedJwt;
    } catch (error) {
        errorLog("Failed to generate JWT token:", error);
        return null;
    }
}

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

        return data.access_token;
    } catch (error) {
        errorLog("Error exchanging JWT for access token:", error);
        return null;
    }
}

async function getAccessToken(): Promise<string | null> {
    if (cachedToken && Date.now() < tokenExpiration) {
        return cachedToken;
    }

    log("Token missing or expired, refreshing...");
    cachedToken = await refreshToken();
    tokenExpiration = Date.now() + TOKEN_REFRESH_INTERVAL_MS;
    log(
        "Token refreshed, expires at:",
        new Date(tokenExpiration).toISOString(),
    );
    return cachedToken;
}

// Start periodic token refresh if credentials are configured
if (process.env.GOOGLE_PRIVATE_KEY) {
    getAccessToken().catch((error) => {
        errorLog("Failed to initialize Google Cloud authentication:", error);
    });

    setInterval(() => {
        getAccessToken().catch((error) => {
            errorLog("Failed to refresh Google Cloud access token:", error);
        });
    }, TOKEN_REFRESH_INTERVAL_MS);
}

export default { getAccessToken };
