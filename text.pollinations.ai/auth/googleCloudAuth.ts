import debug from "debug";
import fetch from "node-fetch";

interface ServiceAccountKey {
    type: string;
    project_id: string | undefined;
    private_key_id: string;
    private_key: string;
    client_email: string;
}

/** Refresh tokens at 50 minutes (tokens last 60 minutes) */
const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

interface GoogleAuthInstance {
    getAccessToken: () => Promise<string | null>;
}

function createGoogleAuth(envPrefix: string): GoogleAuthInstance {
    const log = debug(`pollinations:google-auth:${envPrefix}`);
    const errorLog = debug(`pollinations:google-auth:${envPrefix}:error`);

    let cachedToken: string | null = null;
    let tokenExpiration = 0;

    async function refreshToken(): Promise<string | null> {
        const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`];
        const privateKeyId = process.env[`${envPrefix}_PRIVATE_KEY_ID`];
        const clientEmail = process.env[`${envPrefix}_CLIENT_EMAIL`];
        const projectId = process.env[`${envPrefix}_PROJECT_ID`];

        if (!privateKey || !privateKeyId || !clientEmail) {
            errorLog(
                `Missing required credentials. Need: ${envPrefix}_PRIVATE_KEY, ${envPrefix}_PRIVATE_KEY_ID, ${envPrefix}_CLIENT_EMAIL`,
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

        const jwt = await generateJwtToken(keyData, errorLog);
        if (!jwt) return null;

        const accessToken = await exchangeJwtForAccessToken(jwt, errorLog);
        if (!accessToken) return null;

        log("Successfully authenticated using service account key");
        return accessToken;
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
    if (process.env[`${envPrefix}_PRIVATE_KEY`]) {
        getAccessToken().catch((error) => {
            errorLog("Failed to initialize authentication:", error);
        });

        setInterval(() => {
            getAccessToken().catch((error) => {
                errorLog("Failed to refresh access token:", error);
            });
        }, TOKEN_REFRESH_INTERVAL_MS);
    }

    return { getAccessToken };
}

async function generateJwtToken(
    keyData: ServiceAccountKey,
    errorLog: debug.Debugger,
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

async function exchangeJwtForAccessToken(
    jwt: string,
    errorLog: debug.Debugger,
): Promise<string | null> {
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

// Default instance (existing account) — reads GOOGLE_* env vars
const googleCloudAuth = createGoogleAuth("GOOGLE");

// Netsim instance — reads GOOGLE_NETSIM_* env vars
export const googleCloudAuthNetsim = createGoogleAuth("GOOGLE_NETSIM");

export default googleCloudAuth;
