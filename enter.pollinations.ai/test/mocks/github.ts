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
