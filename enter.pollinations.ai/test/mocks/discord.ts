import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";

type MockDiscordState = {
    userId: string;
    membershipRequestCount: number;
    membershipStatus: number;
    membershipErrorCode: number;
    retryAfterSeconds: number;
};

export function createMockDiscord(): MockAPI<MockDiscordState> {
    const state = {
        userId: "987654321",
        membershipRequestCount: 0,
        membershipStatus: 200,
        membershipErrorCode: 10007,
        retryAfterSeconds: 12,
    };
    const userProfile = {
        id: state.userId,
        username: "discord-test-user",
        discriminator: "0",
        global_name: "Discord Test User",
        avatar: null,
        email: null,
        verified: false,
    };
    const discord = new Hono()
        .post("/api/oauth2/token", (c) =>
            c.json({
                access_token: "mock_discord_access_token",
                expires_in: 604800,
                refresh_token: "mock_discord_refresh_token",
                scope: "identify email",
                token_type: "Bearer",
            }),
        )
        .get("/api/users/@me", (c) => c.json(userProfile))
        .get("/api/users/%40me", (c) => c.json(userProfile))
        .get("/api/v10/guilds/885844321461485618/members/:userId", (c) => {
            state.membershipRequestCount += 1;
            if (
                c.req.header("Authorization") !== "Bot test_discord_bot_token"
            ) {
                return c.json({ message: "Unauthorized" }, 401);
            }
            if (state.membershipStatus === 404) {
                return c.json(
                    {
                        code: state.membershipErrorCode,
                        message: "Not Found",
                    },
                    404,
                );
            }
            if (state.membershipStatus === 429) {
                return c.json(
                    {
                        message: "You are being rate limited.",
                        retry_after: state.retryAfterSeconds,
                    },
                    429,
                    { "Retry-After": String(state.retryAfterSeconds) },
                );
            }
            return c.json({
                user: userProfile,
                joined_at: "2021-09-10T11:09:04.586000+00:00",
                roles: [],
            });
        });

    return {
        state,
        reset: () => {
            state.membershipRequestCount = 0;
            state.membershipStatus = 200;
            state.membershipErrorCode = 10007;
            state.retryAfterSeconds = 12;
        },
        handlerMap: {
            "discord.com": createHonoMockHandler(discord),
        },
    };
}
