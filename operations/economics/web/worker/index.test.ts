import { afterEach, describe, expect, it, vi } from "vitest";
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

async function authenticatedCookie() {
    const response = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: env.ECONOMICS_PASSWORD }),
    });
    return response.headers.get("Set-Cookie") || "";
}

afterEach(() => {
    vi.unstubAllGlobals();
});

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

    it("rejects pipe reads without a session", async () => {
        const upstream = vi.fn();
        vi.stubGlobal("fetch", upstream);

        const response = await request("/api/pipes/op_cloud_api");

        expect(response.status).toBe(401);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("rejects pipes outside the read allowlist", async () => {
        const upstream = vi.fn();
        vi.stubGlobal("fetch", upstream);

        const response = await request("/api/pipes/secret_pipe", {
            headers: { Cookie: await authenticatedCookie() },
        });

        expect(response.status).toBe(404);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("forwards an authenticated allowlisted pipe with the read token", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValue(
                Response.json({ data: [{ entry_id: "cloud-1" }] }),
            );
        vi.stubGlobal("fetch", upstream);

        const response = await request("/api/pipes/op_cloud_api", {
            headers: { Cookie: await authenticatedCookie() },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            data: [{ entry_id: "cloud-1" }],
        });
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/op_cloud_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });
});
