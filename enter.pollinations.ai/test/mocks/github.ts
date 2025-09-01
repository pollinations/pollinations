import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createHonoMockHandler, type MockHandlerMap } from "./fetch";

export function createGithubMockHandlers(): MockHandlerMap {
    const githubAPI = new Hono();

    // Custom auth middleware
    const githubAuth = createMiddleware(async (c, next) => {
        const authHeader = c.req.header("Authorization");
        if (!authHeader?.includes("mock_github_auth_token")) {
            return c.json({ message: "Bad credentials" }, 401);
        }
        return next();
    });

    // Apply auth middleware to protected routes
    githubAPI.use("/user/*", githubAuth);
    githubAPI.use("/user", githubAuth);

    // Routes
    githubAPI.get("/user/emails", (c) => {
        return c.json([
            {
                email: "test@example.com",
                primary: true,
                verified: true,
                visibility: "public",
            },
        ]);
    });

    githubAPI.get("/user", (c) => {
        return c.json({
            id: 12345,
            login: "testuser",
            name: "Test User",
            email: "test@example.com",
            avatar_url: "https://avatars.githubusercontent.com/u/12345?v=4",
        });
    });

    // OAuth app (no auth needed)
    const githubOAuth = new Hono();
    githubOAuth.post("/login/oauth/access_token", (c) => {
        return c.json({
            access_token: "mock_github_auth_token",
            token_type: "bearer",
            scope: "read:user user:email",
        });
    });

    return {
        "github.com": createHonoMockHandler(githubOAuth),
        "api.github.com": createHonoMockHandler(githubAPI),
    };
}
