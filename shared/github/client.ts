/** Minimal GitHub GraphQL client for GitHub App installation tokens. */

import { GITHUB_API, GITHUB_USER_AGENT } from "./api.ts";

/** Run a single GraphQL query. Throws if the response carries `errors`. */
export async function graphql<T>(
    token: string,
    query: string,
    variables: Record<string, unknown>,
): Promise<T> {
    const res = await fetch(`${GITHUB_API}/graphql`, {
        method: "POST",
        headers: {
            Authorization: `token ${token}`,
            "User-Agent": GITHUB_USER_AGENT,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        throw new Error(`GitHub GraphQL -> ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: T; errors?: unknown };
    if (body.errors) {
        throw new Error(
            `GitHub GraphQL errors: ${JSON.stringify(body.errors)}`,
        );
    }
    if (!body.data) {
        throw new Error("GitHub GraphQL returned no data");
    }
    return body.data;
}
