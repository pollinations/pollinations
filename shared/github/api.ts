export const GITHUB_API = "https://api.github.com";
export const GITHUB_USER_AGENT = "pollinations-enter";

const GITHUB_JSON_ACCEPT = "application/vnd.github+json";
const GITHUB_API_VERSION = "2022-11-28";

export function githubRestHeaders(
    options: {
        authorization?: string;
        apiVersion?: boolean;
    } = {},
): Record<string, string> {
    return {
        ...(options.authorization
            ? { Authorization: options.authorization }
            : {}),
        Accept: GITHUB_JSON_ACCEPT,
        ...(options.apiVersion
            ? { "X-GitHub-Api-Version": GITHUB_API_VERSION }
            : {}),
        "User-Agent": GITHUB_USER_AGENT,
    };
}

export function githubOAuthAppHeaders(env: {
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
}): Record<string, string> {
    const headers = githubRestHeaders();
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
    }
    return headers;
}
