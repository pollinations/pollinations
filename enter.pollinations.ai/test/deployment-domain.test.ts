import { afterEach, expect, test, vi } from "vitest";
import {
    attachDeploymentDomain,
    detachDeploymentDomain,
} from "../src/services/deployment-domain.ts";

const env = {
    APP_DEPLOY_HOST: "pollinations.ai",
    APP_DEPLOY_SERVICE: "pollinations-app-host-staging",
    APP_DEPLOY_ZONE_ID: "zone-id",
    CF_WORKER_DEPLOY_API_TOKEN: "worker-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
};

afterEach(() => vi.unstubAllGlobals());

test("attaches an exact deployment hostname to the gen worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
            success: true,
            result: { id: "domain-id" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await attachDeploymentDomain(env, "my-app-1234abcd");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
        "https://api.cloudflare.com/client/v4/accounts/account-id/workers/domains",
    );
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
        hostname: "my-app-1234abcd.pollinations.ai",
        service: "pollinations-app-host-staging",
        zone_id: "zone-id",
    });
});

test("detaches only a hostname owned by the configured gen worker", async () => {
    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
            Response.json({
                success: true,
                result: [
                    { id: "other", service: "another-worker" },
                    { id: "ours", service: "pollinations-app-host-staging" },
                ],
            }),
        )
        .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await detachDeploymentDomain(env, "my-app-1234abcd");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
        "https://api.cloudflare.com/client/v4/accounts/account-id/workers/domains/ours",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
});

test("rejects invalid deployment slugs before calling Cloudflare", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(attachDeploymentDomain(env, "../escape")).rejects.toThrow(
        "Invalid deployment slug",
    );
    expect(fetchMock).not.toHaveBeenCalled();
});
