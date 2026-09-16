import type { GitAuth, GitClientFactory } from "@cloudflare/computer/git";
import {
    type GithubAppCredentials,
    getInstallationToken,
} from "../../../shared/github/app-auth.ts";

// The one repository every Pollinations agent can push to. It is public, so
// clone needs no token; fetch, pull and push get the App token.
export const COLLECTIVE_REPO_URL =
    "https://github.com/pollinations/collective-memory.git";

// Exact match only. A prefix check would also hand the token to paths such
// as `collective-memory/../pollinations`, which fetch normalises away.
const COLLECTIVE_URL =
    /^https:\/\/github\.com\/pollinations\/collective-memory(\.git)?\/?$/i;

export function isCollectiveRepo(url: string | undefined): boolean {
    return url !== undefined && COLLECTIVE_URL.test(url);
}

// Adds the GitHub App token to network calls for the collective repository
// and refuses force pushes and remote branch deletes there. The token stays
// in the Durable Object: the shell never sees it. A GitHub ruleset on the
// repository enforces the same history rules independently.
export function withCollectiveRepo(
    factory: GitClientFactory,
    credentials: GithubAppCredentials | undefined,
    userId: () => string | undefined,
): GitClientFactory {
    const onAuth = async (url: string): Promise<GitAuth | undefined> => {
        if (!credentials || !isCollectiveRepo(url)) return undefined;
        const token = await getInstallationToken(credentials, "pollinations");
        return { username: "x-access-token", password: token };
    };
    return (options) => {
        const client = factory(options);
        // The shell's `git` command calls the methods of this same object,
        // so replacing them here covers `git push` inside bash as well.
        const { fetch, pull, push, remoteList } = client;
        client.fetch = (input = {}) => fetch({ ...input, onAuth });
        client.pull = (input = {}) => pull({ ...input, onAuth });
        client.push = async (input = {}) => {
            const url =
                input.url ??
                (await remoteList({ dir: input.dir })).find(
                    (remote) => remote.name === (input.remote ?? "origin"),
                )?.url;
            if (!isCollectiveRepo(url)) return push(input);
            if (input.force || input.delete) {
                return {
                    ok: false,
                    error: "collective memory keeps its history: force pushes and branch deletes are refused",
                    refs: {},
                };
            }
            const result = await push({ ...input, onAuth });
            // The App is the pusher on GitHub; this log names the user.
            console.log(
                JSON.stringify({
                    event: "collective_memory_push",
                    userId: userId(),
                    ref: input.ref,
                    ok: result.ok,
                }),
            );
            return result;
        };
        return client;
    };
}
