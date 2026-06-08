import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";

export type MockGoogleState = {
    user: {
        sub: string;
        email: string;
        emailVerified: boolean;
        name: string;
        picture: string;
    };
};

function base64UrlJson(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createIdToken(user: MockGoogleState["user"]): string {
    const now = Math.floor(Date.now() / 1000);
    return `${base64UrlJson({ alg: "none", typ: "JWT" })}.${base64UrlJson({
        aud: "test_google_client_id",
        iss: "https://accounts.google.com",
        sub: user.sub,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.picture,
        iat: now,
        exp: now + 3600,
    })}.`;
}

export function createMockGoogle(): MockAPI<MockGoogleState> {
    const initialUser: MockGoogleState["user"] = {
        sub: "google-user-1",
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
        picture: "https://lh3.googleusercontent.com/a/default-user",
    };

    const state: MockGoogleState = {
        user: { ...initialUser },
    };

    const googleOAuth = new Hono().post("/token", (c) => {
        return c.json({
            access_token: "mock_google_auth_token",
            expires_in: 3600,
            id_token: createIdToken(state.user),
            scope: "openid email profile",
            token_type: "Bearer",
        });
    });

    const reset = () => {
        state.user = { ...initialUser };
    };

    return {
        state,
        reset,
        handlerMap: {
            "oauth2.googleapis.com": createHonoMockHandler(googleOAuth),
        },
    };
}
