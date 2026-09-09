import { Pollinations } from "@pollinations/sdk";

const CONSENT_BUDGET = 5;
const CONSENT_EXPIRY_DAYS = 7;

export function buildConsentUrl(verificationUri, appKey, userCode, agentId) {
    const url = new URL("/authorize", verificationUri);
    url.searchParams.set("user_code", userCode);
    url.searchParams.set("client_id", appKey);
    url.searchParams.set("models", agentId);
    url.searchParams.set("budget", String(CONSENT_BUDGET));
    url.searchParams.set("expiry", String(CONSENT_EXPIRY_DAYS));
    return url.toString();
}

export async function startDeviceAuthorization(config, signal) {
    const auth = await Pollinations.authorizeDevice({
        clientId: config.appKey,
        signal,
    });
    return {
        ...auth,
        verificationUri: buildConsentUrl(
            auth.verificationUri,
            config.appKey,
            auth.userCode,
            config.agentId,
        ),
    };
}

export async function getUserInfo(token) {
    return new Pollinations({ apiKey: token, textTimeout: 20_000 }).userInfo();
}

export async function askAgent(token, messages, agentId) {
    const response = await new Pollinations({
        apiKey: token,
        textTimeout: 90_000,
    }).chat(messages, {
        model: agentId,
        maxTokens: 900,
        private: true,
    });
    return response.choices[0]?.message?.content?.trim() || "";
}

export function isAuthorizationError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const code = String(error?.code || "").toUpperCase();
    return (
        status === 401 ||
        status === 403 ||
        /AUTH|API_KEY|UNAUTHORIZED/.test(code)
    );
}

export function isBudgetError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const code = String(error?.code || "").toUpperCase();
    return status === 402 || /INSUFFICIENT_BALANCE|BUDGET/.test(code);
}
