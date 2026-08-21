import { describe, expect, it } from "vitest";
import worker from "./index";

const env = {
    ECONOMICS_PASSWORD: "correct horse battery staple",
    TINYBIRD_API: "https://api.europe-west2.gcp.tinybird.co",
    TINYBIRD_ECONOMICS_READ_TOKEN: "test-token",
};

function request(path: string, init?: RequestInit) {
    return worker.fetch(
        new Request(`https://economics.myceli.ai${path}`, init) as Parameters<
            typeof worker.fetch
        >[0],
        env,
    );
}

describe("economics Worker auth", () => {
    it("reports an unauthenticated session", async () => {
        const response = await request("/api/auth/session");

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            authenticated: false,
        });
    });

    it("rejects the wrong password", async () => {
        const response = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: "wrong" }),
        });

        expect(response.status).toBe(401);
    });

    it("creates a secure session cookie", async () => {
        const login = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: env.ECONOMICS_PASSWORD }),
        });
        const cookie = login.headers.get("Set-Cookie");

        expect(login.status).toBe(204);
        expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");

        const session = await request("/api/auth/session", {
            headers: { Cookie: cookie || "" },
        });
        await expect(session.json()).resolves.toEqual({ authenticated: true });
    });
});
