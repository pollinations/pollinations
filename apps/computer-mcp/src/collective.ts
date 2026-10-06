import type { CredentialProvider } from "just-git";
import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "../../../shared/github/app-auth.ts";

// Public repository every agent can push to; its GitHub rulesets block force
// pushes and deletions.
export const COLLECTIVE_REPO_URL =
    "https://github.com/pollinations/collective-memory";

// Git over HTTP to the collective repo gets a GitHub App token. `git` runs
// inside the Durable Object, so the token never reaches the shell. Without a
// token (no App secrets, or minting fails) git stays anonymous: clones still
// work, pushes are refused by GitHub.
export function collectiveCredentials(env: {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
}): CredentialProvider {
    return async (url) => {
        if (url.replace(/\.git$/, "") !== COLLECTIVE_REPO_URL) return null;
        try {
            const token = await getInstallationToken(
                githubAppCredentialsFromEnv(env),
                "pollinations",
            );
            return {
                type: "basic",
                username: "x-access-token",
                password: token,
            };
        } catch (error) {
            console.error("collective memory token", error);
            return null;
        }
    };
}
