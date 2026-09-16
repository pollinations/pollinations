import type { GitClientFactory } from "@cloudflare/computer/git";
import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "../../../shared/github/app-auth.ts";

// Public repository every agent can push to; its GitHub rulesets block force
// pushes and deletions.
export const COLLECTIVE_REPO_URL =
    "https://github.com/pollinations/collective-memory";

// Pushes to the collective repo get a GitHub App token. The shell's `git`
// calls push on the client object returned here, so the token is added inside
// the Durable Object and never reaches the shell.
export function withCollectiveRepo(
    factory: GitClientFactory,
    env: { GITHUB_APP_ID?: string; GITHUB_APP_PRIVATE_KEY?: string },
): GitClientFactory {
    return (options) => {
        const client = factory(options);
        const push = client.push;
        client.push = (input = {}) =>
            push({
                ...input,
                onAuth: async (url) =>
                    url.replace(/\.git$/, "") === COLLECTIVE_REPO_URL
                        ? {
                              username: "x-access-token",
                              password: await getInstallationToken(
                                  githubAppCredentialsFromEnv(env),
                                  "pollinations",
                              ),
                          }
                        : undefined,
            });
        return client;
    };
}
