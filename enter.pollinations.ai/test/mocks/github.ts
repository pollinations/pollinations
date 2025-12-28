import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createHonoMockHandler, type MockAPI } from "./fetch";

export type MockGithubState = {
    user: {
        id: number;
        login: string;
        name: string;
        email: string;
        avatar_url: string;
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
        },
    };

    const githubAuth = createMiddleware(async (c, next) => {
        const authHeader = c.req.header("Authorization");
        if (!authHeader?.includes("mock_github_auth_token")) {
            return c.json({ message: "Bad credentials" }, 401);
        }
        return next();
    });

    const githubAPI = new Hono()
        .use("/user", githubAuth)
        .use("/user/*", githubAuth)
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
