/**
 * Minimal GitHub GraphQL client for the repo mirror. Authenticates with an
 * installation token (`Authorization: token <token>`) and uses cursor
 * pagination. Generic and quest-agnostic — it just fetches GitHub state.
 *
 * The mirror is all-GraphQL: a single auth, a single pagination idiom, and the
 * `issues`/`pullRequests` connections return exactly the right rows (the REST
 * `/issues` feed mixes PRs in; GraphQL does not).
 */

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "pollinations-github-mirror";

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
            "User-Agent": USER_AGENT,
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

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

/**
 * Page through a GraphQL connection. `extract` pulls the connection
 * ({ pageInfo, nodes }) out of the query result; `onNodes` receives each page's
 * nodes. Returns the number of pages fetched.
 */
export async function graphqlPaginate<TData, TNode>(
    token: string,
    query: string,
    variables: Record<string, unknown>,
    extract: (data: TData) => { pageInfo: PageInfo; nodes: TNode[] },
    onNodes: (nodes: TNode[], pageIndex: number) => void,
): Promise<number> {
    let cursor: string | null = null;
    let pageIndex = 0;
    do {
        const data = await graphql<TData>(token, query, {
            ...variables,
            cursor,
        });
        const conn = extract(data);
        onNodes(conn.nodes, pageIndex);
        pageIndex++;
        cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
    return pageIndex;
}
