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

    it.each([
        ["an unknown site", "https://missing.pollinations.app/"],
        ["a host that can't be a site", "https://8080-abc.pollinations.app/"],
    ])("returns 404 for %s", async (_case, url) => {
        const { env } = sitesEnv(async () => {
            throw new Error("Worker not found.");
        });
        const response = await serveSite(new Request(url), env);
        expect(response?.status).toBe(404);
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
