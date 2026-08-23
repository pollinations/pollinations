import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";

type MockDiscordState = {
    userId: string;
};

export function createMockDiscord(): MockAPI<MockDiscordState> {
    const state = { userId: "987654321" };
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
            if (
                c.req.header("Authorization") !== "Bot test_discord_bot_token"
            ) {
                return c.json({ message: "Unauthorized" }, 401);
            }
            return c.json({
                user: userProfile,
                joined_at: "2021-09-10T11:09:04.586000+00:00",
                roles: [],
            });
        });

    return {
        state,
        reset: () => undefined,
        handlerMap: {
            "discord.com": createHonoMockHandler(discord),
        },
    };
}
