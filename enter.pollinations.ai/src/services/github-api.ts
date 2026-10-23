import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";

const APP_INSTALLATION_OWNER = "pollinations";

export type GitHubApiEnv = {
    ENVIRONMENT: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
};

export async function githubApiHeaders(
    env: GitHubApiEnv,
): Promise<Record<string, string>> {
    const token =
        env.ENVIRONMENT === "test"
            ? "mock_github_auth_token"
            : await getInstallationToken(
                  githubAppCredentialsFromEnv(env),
                  APP_INSTALLATION_OWNER,
              );
    return {
        Accept: "application/vnd.github+json",
        "User-Agent": "pollinations-enter",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `token ${token}`,
    };
}
