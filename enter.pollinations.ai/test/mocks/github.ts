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
        assignees?: { login: string }[];
        labels?: Array<{ name: string }>;
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
        questIssues: [
            {
                number: 321,
                title: "Add a demo app",
                state: "open",
                html_url:
                    "https://github.com/pollinations/pollinations/issues/321",
                body: "### Goal\nBuild a focused demo.\n\n### Reward\n15",
                created_at: "2026-06-01T00:00:00Z",
                updated_at: "2026-06-02T00:00:00Z",
                closed_at: null,
                user: { login: "maintainer" },
                assignees: [],
                labels: [{ name: "POLLEN-QUEST" }],
            },
            {
                number: 322,
                title: "Fix a model config",
                state: "open",
                html_url:
                    "https://github.com/pollinations/pollinations/issues/322",
                body: "### What to build\nWire the missing config.\n\n### Reward\n20 pollen",
                created_at: "2026-06-03T00:00:00Z",
                updated_at: "2026-06-04T00:00:00Z",
                closed_at: null,
                user: { login: "maintainer" },
                assignees: [{ login: "dev-user" }],
                labels: [{ name: "POLLEN-QUEST" }],
            },
        ],
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
