import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

export type MockRewardComment = {
    body: string;
    createdAt: string;
    lastEditedAt: string | null;
    author: { __typename: string; login: string; databaseId?: number } | null;
    editor: MockRewardComment["author"];
};

export type MockGithubState = {
    secretScanningPublicKeys: Array<{
        key_identifier: string;
        key: string;
    }>;
    user: {
        id: number;
        login: string;
        name: string;
        email: string;
        avatar_url: string;
        created_at: string;
    };
    questIssues: Array<{
        number: number;
        repository?: string;
        title: string;
        state: "open" | "closed";
        html_url: string;
        body: string | null;
        created_at: string;
        updated_at: string;
        closed_at: string | null;
        user: { login: string; databaseId?: number | null } | null;
        assignees?: { login: string; databaseId?: number | null }[];
        labels?: Array<{ name: string }>;
        comments?: MockRewardComment[];
        closedByPullRequestsReferences?: Array<{
            number: number;
            mergedAt: string | null;
            headRefName?: string;
            author: {
                __typename?: string;
                login?: string;
                databaseId?: number | null;
            } | null;
        }>;
    }>;
    mergedPullRequests: Array<{
        number: number;
        repository?: string;
        authorLogin: string;
        mergedAt: string | null;
        authorId?: number;
        authorType?: string;
        title?: string;
        headRefOid?: string;
        comments?: MockRewardComment[];
        closingIssuesReferences?: Array<{
            number: number;
            repository?: string;
        }>;
    }>;
    // Commit author GitHub ids per PR number, including co-authors.
    commitAuthors: Record<number, number[]>;
    repos: Array<{
        name: string;
        fork?: boolean;
        size?: number;
        stargazers_count?: number;
    }>;
    requests: Array<{ method: string; path: string; url: string }>;
    failQuestSearch: boolean;
};

export function createMockGithub(): MockAPI<MockGithubState> {
    const state: MockGithubState = {
        secretScanningPublicKeys: [],
        user: {
            id: 12345,
            login: "testuser",
            name: "Test User",
            email: "test@example.com",
            avatar_url: "https://avatars.githubusercontent.com/u/12345?v=4",
            created_at: "2018-01-01T00:00:00Z",
        },
        questIssues: [],
        mergedPullRequests: [],
        commitAuthors: {},
        repos: [],
        requests: [],
        failQuestSearch: false,
    };

    const githubAuth = createMiddleware(async (c, next) => {
        const authHeader = c.req.header("Authorization");
        // Real GitHub rejects OAuth client_id/secret Basic auth with 401, so the
        // mock must too — accepting it hid a live 401 behind green tests.
        const isUserToken = authHeader?.includes("mock_github_auth_token");
        if (!isUserToken) {
            return c.json({ message: "Bad credentials" }, 401);
        }
        return await next();
    });
    const trackRequest = createMiddleware(async (c, next) => {
        const url = new URL(c.req.url);
        state.requests.push({
            method: c.req.method,
            path: url.pathname,
            url: c.req.url,
        });
        return await next();
    });

    const githubAPI = new Hono()
        .use("*", trackRequest)
        .get("/meta/public_keys/secret_scanning", (c) =>
            c.json({ public_keys: state.secretScanningPublicKeys }),
        )
        .get("/search/issues", (c) => {
            if (state.failQuestSearch) {
                return c.json({ message: "rate limited" }, 403);
            }
            return c.json({ items: state.questIssues });
        })
        .use("*", githubAuth)
        .post("/graphql", async (c) => {
            if (state.failQuestSearch) {
                return c.json({ errors: [{ message: "rate limited" }] }, 200);
            }
            const body = (await c.req.json()) as {
                query?: string;
                variables?: {
                    query?: string;
                    after?: string | null;
                    before?: string | null;
                    number?: number;
                    login?: string;
                };
            };
            const commentPage = (comments: MockRewardComment[] = []) => {
                const end = Number(body.variables?.before ?? comments.length);
                const start = Math.max(0, end - 20);
                return {
                    nodes: comments.slice(start, end),
                    pageInfo: {
                        hasPreviousPage: start > 0,
                        startCursor: String(start),
                    },
                };
            };
            const closingIssuesPage = (
                pr: MockGithubState["mergedPullRequests"][number] | undefined,
                after: string | null = null,
            ) => {
                const issues =
                    pr?.closingIssuesReferences ??
                    state.questIssues.filter((issue) =>
                        issue.closedByPullRequestsReferences?.some(
                            (closer) => closer.number === pr?.number,
                        ),
                    );
                const start = Number(after ?? 0);
                const nodes = issues.slice(start, start + 100).map((issue) => ({
                    number: issue.number,
                    repository: {
                        nameWithOwner:
                            issue.repository ?? "pollinations/pollinations",
                    },
                }));
                return {
                    nodes,
                    pageInfo: {
                        hasNextPage: start + nodes.length < issues.length,
                        endCursor: String(start + nodes.length),
                    },
                };
            };
            if (body.query?.includes("issueOrPullRequest")) {
                const item = [
                    ...state.questIssues,
                    ...state.mergedPullRequests,
                ].find(
                    (entry) =>
                        entry.number === body.variables?.number &&
                        (!entry.repository ||
                            entry.repository === "pollinations/pollinations"),
                );
                return c.json({
                    data: {
                        repository: {
                            issueOrPullRequest: {
                                comments: commentPage(item?.comments),
                            },
                        },
                    },
                });
            }
            if (body.query?.includes("pullRequest(number:$number)")) {
                const pr = state.mergedPullRequests.find(
                    (entry) =>
                        entry.number === body.variables?.number &&
                        (!entry.repository ||
                            entry.repository === "pollinations/pollinations"),
                );
                return c.json({
                    data: {
                        repository: {
                            pullRequest: {
                                closingIssuesReferences: closingIssuesPage(
                                    pr,
                                    body.variables?.after,
                                ),
                            },
                        },
                    },
                });
            }
            // Commit authors arrive as one query with a `pr<number>:` alias
            // per pull request.
            const prNumbers = [
                ...(body.query ?? "").matchAll(/pr(\d+):pullRequest/g),
            ].map((match) => Number(match[1]));
            if (prNumbers.length > 0) {
                const repository = Object.fromEntries(
                    prNumbers.map((prNumber) => [
                        `pr${prNumber}`,
                        {
                            commits: {
                                nodes: [
                                    {
                                        commit: {
                                            authors: {
                                                nodes: (
                                                    state.commitAuthors[
                                                        prNumber
                                                    ] ?? []
                                                ).map((databaseId) => ({
                                                    user: { databaseId },
                                                })),
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    ]),
                );
                return c.json({ data: { repository } });
            }
            const search = body.variables?.query ?? "";
            if (body.query?.includes("contributions:pullRequests")) {
                const author = body.variables?.login;
                const matches = state.mergedPullRequests.filter(
                    (pr) =>
                        (!author || pr.authorLogin === author) &&
                        pr.mergedAt !== null,
                );
                const start = Number(body.variables?.after ?? 0);
                const nodes = matches.slice(start, start + 100).map((pr) => ({
                    number: pr.number,
                    repository: {
                        nameWithOwner:
                            pr.repository ?? "pollinations/pollinations",
                    },
                    mergedAt: pr.mergedAt,
                    title: pr.title ?? `PR ${pr.number}`,
                    url: `https://github.com/${pr.repository ?? "pollinations/pollinations"}/pull/${pr.number}`,
                    headRefOid: pr.headRefOid ?? "a".repeat(40),
                    author: {
                        __typename: pr.authorType ?? "User",
                        login: pr.authorLogin,
                        databaseId: pr.authorId ?? state.user.id,
                    },
                    comments: commentPage(pr.comments),
                    closingIssuesReferences: closingIssuesPage(pr),
                }));
                return c.json({
                    data: {
                        user: {
                            contributions: {
                                nodes,
                                pageInfo: {
                                    hasNextPage:
                                        start + nodes.length < matches.length,
                                    endCursor: String(start + nodes.length),
                                },
                            },
                        },
                    },
                });
            }

            const userIssues = body.query?.includes("contributions:issues");
            const author = userIssues
                ? body.variables?.login
                : search.match(/\bauthor:([^\s]+)/)?.[1];
            const label = search.match(/\blabel:([^\s]+)/)?.[1];
            const issues = state.questIssues.filter(
                (issue) =>
                    (!author || issue.user?.login === author) &&
                    (userIssues
                        ? issue.state === "closed"
                        : !issue.repository ||
                          issue.repository === "pollinations/pollinations") &&
                    (!label ||
                        issue.labels?.some(({ name }) => name === label)),
            );
            const start = Number(body.variables?.after ?? 0);
            const nodes = issues.slice(start, start + 100).map((issue) => ({
                number: issue.number,
                repository: {
                    nameWithOwner:
                        issue.repository ?? "pollinations/pollinations",
                },
                state: issue.state.toUpperCase(),
                title: issue.title,
                url: issue.html_url,
                body: issue.body,
                author: issue.user
                    ? {
                          __typename: "User",
                          login: issue.user.login,
                          databaseId: issue.user.databaseId ?? null,
                      }
                    : null,
                comments: commentPage(issue.comments),
                assignees: {
                    nodes: (issue.assignees ?? []).map((assignee) => ({
                        login: assignee.login,
                        databaseId: assignee.databaseId ?? null,
                    })),
                },
                labels: { nodes: issue.labels ?? [] },
                closedByPullRequestsReferences: {
                    nodes: issue.closedByPullRequestsReferences ?? [],
                },
            }));
            const next = start + nodes.length;
            const connection = {
                nodes,
                pageInfo: {
                    hasNextPage: next < issues.length,
                    endCursor: next < issues.length ? String(next) : null,
                },
            };
            return c.json({
                data: userIssues
                    ? { user: { contributions: connection } }
                    : { search: connection },
            });
        })
        .get("/user/emails", (c) => {
            return c.json([
                {
                    email: state.user.email,
                    primary: true,
                    verified: true,
                    visibility: "public",
                },
            ]);
        })
        .get("/user", (c) => {
            return c.json(state.user);
        })
        .get("/user/:id", (c) => {
            if (Number(c.req.param("id")) !== state.user.id) {
                return c.json({ message: "Not Found" }, 404);
            }
            return c.json(state.user);
        })
        .get("/users/:login/repos", (c) => {
            if (c.req.param("login") !== state.user.login) {
                return c.json({ message: "Not Found" }, 404);
            }
            const page = Number(c.req.query("page") ?? "1");
            const perPage = Number(c.req.query("per_page") ?? "30");
            const start = (page - 1) * perPage;
            return c.json(state.repos.slice(start, start + perPage));
        });

    // OAuth app (no auth needed)
    const githubOAuth = new Hono().post("/login/oauth/access_token", (c) => {
        return c.json({
            access_token: "mock_github_auth_token",
            token_type: "bearer",
            scope: "read:user user:email",
        });
    });

    const handlerMap = {
        "github.com": createHonoMockHandler(githubOAuth),
        "api.github.com": createHonoMockHandler(githubAPI),
    };

    const reset = () => {
        state.secretScanningPublicKeys = [];
        state.requests = [];
    };

    return {
        state,
        reset,
        handlerMap,
    };
}
