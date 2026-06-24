import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

export type MockGithubState = {
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
        user: { login: string } | null;
        assignees?: { login: string; databaseId?: number | null }[];
        labels?: Array<{ name: string }>;
        closedByPullRequestsReferences?: Array<{
            number: number;
            mergedAt: string | null;
        }>;
    }>;
    mergedPullRequests: Array<{
        number: number;
        authorLogin: string;
        mergedAt: string;
    }>;
    repos: Array<{
        name: string;
        fork?: boolean;
        size?: number;
        stargazers_count?: number;
    }>;
    failQuestSearch: boolean;
};

export function createMockGithub(): MockAPI<MockGithubState> {
    const state: MockGithubState = {
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
        repos: [],
        failQuestSearch: false,
    };

    const githubAuth = createMiddleware(async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const isUserToken = authHeader?.includes("mock_github_auth_token");
        const isAppCredentials = authHeader?.startsWith("Basic ");
        if (!isUserToken && !isAppCredentials) {
            return c.json({ message: "Bad credentials" }, 401);
        }
        return await next();
    });

    const githubAPI = new Hono()
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
                variables?: { query?: string };
            };
            const search = body.variables?.query ?? "";
            if (search.includes("is:pr")) {
                const author = search.match(/\bauthor:([^\s]+)/)?.[1];
                const nodes = state.mergedPullRequests
                    .filter((pr) => !author || pr.authorLogin === author)
                    .slice(0, 1)
                    .map((pr) => ({
                        number: pr.number,
                        mergedAt: pr.mergedAt,
                    }));
                return c.json({ data: { search: { nodes } } });
            }

            const nodes = state.questIssues.map((issue) => ({
                number: issue.number,
                state: issue.state.toUpperCase(),
                title: issue.title,
                url: issue.html_url,
                body: issue.body,
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
            return c.json({ data: { search: { nodes } } });
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

    const reset = () => {};

    return {
        state,
        reset,
        handlerMap,
    };
}
