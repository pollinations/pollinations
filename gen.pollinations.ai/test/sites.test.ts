import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { serveSite } from "../src/sites.ts";

const sitesEnv = (fetch: (request: Request) => Promise<Response>) => {
    const get = vi.fn(() => ({ fetch }));
    const env = {
        SITES: { get },
        SITES_HOST_SUFFIX: ".pollinations.app",
    } as unknown as Env["Bindings"];
    return { env, get };
};

describe("serveSite", () => {
    it("serves a site host from the script with the same name", async () => {
        const { env, get } = sitesEnv(async () => new Response("hello"));
        const response = await serveSite(
            new Request("https://my-site.pollinations.app/about"),
            env,
        );
        expect(get).toHaveBeenCalledWith("my-site");
        expect(await response?.text()).toBe("hello");
    });

    it("leaves gen's own hosts to the API", () => {
        const { env, get } = sitesEnv(async () => new Response("hello"));
        expect(
            serveSite(
                new Request("https://gen.pollinations.ai/v1/models"),
                env,
            ),
        ).toBeUndefined();
        expect(get).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown or deleted site", async () => {
        for (const message of [
            "Worker not found.",
            "this worker has been deleted",
        ]) {
            const { env } = sitesEnv(async () => {
                throw new Error(message);
            });
            const response = await serveSite(
                new Request("https://missing.pollinations.app/"),
                env,
            );
            expect(response?.status, message).toBe(404);
        }
    });

    it("returns 404 for a host that can't be a site, without dispatching", async () => {
        const { env, get } = sitesEnv(async () => new Response("hello"));
        const response = await serveSite(
            new Request("https://8080-abc.pollinations.app/"),
            env,
        );
        expect(response?.status).toBe(404);
        expect(get).not.toHaveBeenCalled();
    });

    it("returns 502 when the site fails", async () => {
        const { env } = sitesEnv(async () => {
            throw new Error("internal error");
        });
        vi.spyOn(console, "error").mockImplementation(() => {});
        const response = await serveSite(
            new Request("https://my-site.pollinations.app/"),
            env,
        );
        expect(response?.status).toBe(502);
    });

    it("serves the landing page on the bare domain, never a site", async () => {
        const { env, get } = sitesEnv(async () => new Response("hello"));
        const assets = vi.fn(async (request: Request) =>
            new URL(request.url).pathname === "/favicon.ico"
                ? new Response("icon")
                : new Response(null, { status: 404 }),
        );
        env.ASSETS = { fetch: assets } as unknown as Fetcher;

        const page = await serveSite(
            new Request("https://pollinations.app/"),
            env,
        );
        expect(page?.headers.get("Content-Type")).toBe(
            "text/html; charset=utf-8",
        );
        expect(page?.headers.get("X-Content-Type-Options")).toBe("nosniff");
        const html = await page?.text();
        expect(html).toContain("polli sites deploy");
        expect(html).toContain("@pollinations/ui@");

        const icon = await serveSite(
            new Request("https://pollinations.app/favicon.ico"),
            env,
        );
        expect(await icon?.text()).toBe("icon");

        const missing = await serveSite(
            new Request("https://pollinations.app/my-app"),
            env,
        );
        expect(missing?.status).toBe(404);
        expect(await missing?.text()).toContain("polli sites deploy");
        expect(get).not.toHaveBeenCalled();
    });

    it("uses the staging suffix on staging", async () => {
        const { env, get } = sitesEnv(async () => new Response("hello"));
        env.SITES_HOST_SUFFIX = "--staging.pollinations.app";
        await serveSite(
            new Request("https://my-site--staging.pollinations.app/"),
            env,
        );
        expect(get).toHaveBeenCalledWith("my-site");
    });
});
