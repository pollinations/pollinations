import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

const REPO = "pollinations/pollinations";
const LEGACY_CREATED_AT = "2026-06-01T00:00:00Z";

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
            repository?: string;
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
        authorLogin: string;
        mergedAt: string;
        // Defaults to a PR opened before contribution assessments began.
        createdAt?: string;
        authorId?: number;
        repository?: string;
        comments?: MockRewardComment[];
        closingIssueLabels?: string[][];
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
            const variables = body.variables ?? {};
            const closers = (issue: MockGithubState["questIssues"][number]) =>
                (issue.closedByPullRequestsReferences ?? []).map((pr) => ({
                    ...pr,
                    repository: { nameWithOwner: pr.repository ?? REPO },
                }));
            // The newest 20 comments before the cursor, as `comments(last:20)`.
            const commentPage = (comments: MockRewardComment[] = []) => {
                const end = Number(variables.before ?? comments.length);
                const start = Math.max(0, end - 20);
                return {
                    nodes: comments.slice(start, end),
                    pageInfo: {
                        hasPreviousPage: start > 0,
                        startCursor: String(start),
                    },
                };
            };
            if (body.query?.includes("issueOrPullRequest")) {
                const item = [
                    ...state.questIssues,
                    ...state.mergedPullRequests,
                ].find((entry) => entry.number === variables.number);
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
            // A user's own merged PRs or closed issues, newest first.
            if (body.query?.includes("contributions:")) {
                const nodes: { createdAt: string }[] = body.query.includes(
                    "contributions:pullRequests",
                )
                    ? state.mergedPullRequests
                          .filter((pr) => pr.authorLogin === variables.login)
                          .map((pr) => ({
                              number: pr.number,
                              title: `PR ${pr.number}`,
                              url: `https://github.com/${pr.repository ?? REPO}/pull/${pr.number}`,
                              createdAt: pr.createdAt ?? LEGACY_CREATED_AT,
                              mergedAt: pr.mergedAt,
                              repository: {
                                  nameWithOwner: pr.repository ?? REPO,
                              },
                              author: {
                                  __typename: "User",
                                  login: pr.authorLogin,
                                  databaseId: pr.authorId ?? state.user.id,
                              },
                              comments: commentPage(pr.comments),
                              closingIssuesReferences: {
                                  pageInfo: {
                                      hasNextPage:
                                          (pr.closingIssueLabels ?? []).length >
                                          20,
                                  },
                                  nodes: (pr.closingIssueLabels ?? [])
                                      .slice(0, 20)
                                      .map((labels) => ({
                                          repository: { nameWithOwner: REPO },
                                          labels: {
                                              nodes: labels.map((name) => ({
                                                  name,
                                              })),
                                          },
                                      })),
                              },
                          }))
                    : state.questIssues
                          .filter(
                              (issue) =>
                                  issue.state === "closed" &&
                                  issue.user?.login === variables.login,
                          )
                          .map((issue) => ({
                              number: issue.number,
                              title: issue.title,
                              url: issue.html_url,
                              createdAt: issue.created_at,
                              repository: { nameWithOwner: REPO },
                              author: {
                                  __typename: "User",
                                  login: issue.user?.login,
                                  databaseId: issue.user?.databaseId ?? null,
                              },
                              comments: commentPage(issue.comments),
                              closedByPullRequestsReferences: {
                                  nodes: closers(issue),
                              },
                          }));
                nodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                const start = Number(variables.after ?? 0);
                const page = nodes.slice(start, start + 50);
                return c.json({
                    data: {
                        user: {
                            contributions: {
                                nodes: page,
                                pageInfo: {
                                    hasNextPage:
                                        start + page.length < nodes.length,
                                    endCursor: String(start + page.length),
                                },
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
            const createdBefore = search.match(/\bcreated:<(\S+)/)?.[1];
            if (search.includes("is:pr")) {
                const author = search.match(/\bauthor:([^\s]+)/)?.[1];
                const nodes = state.mergedPullRequests
                    .filter(
                        (pr) =>
                            (!author || pr.authorLogin === author) &&
                            (!createdBefore ||
                                (pr.createdAt ?? LEGACY_CREATED_AT) <
                                    createdBefore),
                    )
                    .slice(0, 1)
                    .map((pr) => ({
                        number: pr.number,
                        mergedAt: pr.mergedAt,
                    }));
                return c.json({ data: { search: { nodes } } });
            }

            const author = search.match(/\bauthor:([^\s]+)/)?.[1];
            const label = search.match(/\blabel:([^\s]+)/)?.[1];
            const issues = state.questIssues.filter(
                (issue) =>
                    (!author || issue.user?.login === author) &&
                    (!createdBefore || issue.created_at < createdBefore) &&
                    (!label ||
                        issue.labels?.some(({ name }) => name === label)),
            );
            const start = Number(body.variables?.after ?? 0);
            const nodes = issues.slice(start, start + 100).map((issue) => ({
                number: issue.number,
                state: issue.state.toUpperCase(),
                title: issue.title,
                url: issue.html_url,
                body: issue.body,
                author: issue.user
                    ? { databaseId: issue.user.databaseId ?? null }
                    : null,
                assignees: {
                    nodes: (issue.assignees ?? []).map((assignee) => ({
                        login: assignee.login,
                        databaseId: assignee.databaseId ?? null,
                    })),
                },
                labels: { nodes: issue.labels ?? [] },
                closedByPullRequestsReferences: {
                    nodes: closers(issue),
                },
            }));
            const next = start + nodes.length;
            return c.json({
                data: {
                    search: {
                        nodes,
                        pageInfo: {
                            hasNextPage: next < issues.length,
                            endCursor:
                                next < issues.length ? String(next) : null,
                        },
                    },
                },
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
