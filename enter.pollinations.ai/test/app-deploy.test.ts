import { afterEach, describe, expect, it, vi } from "vitest";
import {
    APP_SLUG_PATTERN,
    type AppDeployConfig,
    appPublicUrl,
    appWorkerScriptName,
    attachAppDomain,
    attachPublicDomain,
    decodeAppFiles,
    deployAppWorker,
    detachAppDomain,
    detachPublicDomain,
    MAX_APP_TOTAL_BYTES,
    RESERVED_APP_SLUGS,
    requireAppDeployConfig,
} from "../src/services/app-deploy.ts";

const config: AppDeployConfig = {
    accountId: "acct",
    apiToken: "cf_token",
    originZoneId: "zone",
    originDomain: "myceli.ai",
    publicDomain: "pollinations.ai",
};

const proxyConfig: AppDeployConfig = {
    ...config,
    proxy: {
        accountId: "old-acct",
        apiToken: "old_token",
        publicZoneId: "public-zone",
        proxyService: "pollinations-proxy",
    },
};

afterEach(() => {
    vi.unstubAllGlobals();
});

function encode(text: string): string {
    return btoa(text);
}

describe("app slug rules", () => {
    it("accepts DNS labels and rejects everything else", () => {
        expect(APP_SLUG_PATTERN.test("my-app")).toBe(true);
        expect(APP_SLUG_PATTERN.test("a")).toBe(true);
        expect(APP_SLUG_PATTERN.test("app2")).toBe(true);
        expect(APP_SLUG_PATTERN.test("My-App")).toBe(false);
        expect(APP_SLUG_PATTERN.test("-app")).toBe(false);
        expect(APP_SLUG_PATTERN.test("app-")).toBe(false);
        expect(APP_SLUG_PATTERN.test("a.b")).toBe(false);
        expect(APP_SLUG_PATTERN.test("a".repeat(64))).toBe(false);
        expect(APP_SLUG_PATTERN.test("a".repeat(63))).toBe(true);
    });

    it("reserves infra names and live core-service hosts", () => {
        expect(RESERVED_APP_SLUGS.has("www")).toBe(true);
        expect(RESERVED_APP_SLUGS.has("api")).toBe(true);
        // Live pollinations.ai services whose origin is not <slug>.myceli.ai —
        // the reserved list is the only guard that stops a takeover.
        for (const slug of ["gen", "enter", "image", "checkout", "polly"]) {
            expect(RESERVED_APP_SLUGS.has(slug)).toBe(true);
        }
        expect(RESERVED_APP_SLUGS.has("my-cool-app")).toBe(false);
    });
});

describe("requireAppDeployConfig", () => {
    it("throws when a base deploy var is missing", () => {
        expect(() =>
            requireAppDeployConfig({
                CF_APP_ORIGIN_ZONE_ID: "zone",
                CF_APP_ORIGIN_DOMAIN: "myceli.ai",
                CF_APP_PUBLIC_DOMAIN: "pollinations.ai",
            }),
        ).toThrow(/CF_WORKER_DEPLOY/);
    });

    it("throws when an app-specific var is missing", () => {
        expect(() =>
            requireAppDeployConfig({
                CF_WORKER_DEPLOY_ACCOUNT_ID: "acct",
                CF_WORKER_DEPLOY_API_TOKEN: "token",
                CF_APP_ORIGIN_ZONE_ID: "zone",
                CF_APP_ORIGIN_DOMAIN: "myceli.ai",
            }),
        ).toThrow(/CF_APP_/);
    });

    it("composes the full config without public exposure", () => {
        expect(
            requireAppDeployConfig({
                CF_WORKER_DEPLOY_ACCOUNT_ID: "acct",
                CF_WORKER_DEPLOY_API_TOKEN: "token",
                CF_APP_ORIGIN_ZONE_ID: "zone",
                CF_APP_ORIGIN_DOMAIN: "myceli.ai",
                CF_APP_PUBLIC_DOMAIN: "pollinations.ai",
            }),
        ).toEqual({
            accountId: "acct",
            apiToken: "token",
            originZoneId: "zone",
            originDomain: "myceli.ai",
            publicDomain: "pollinations.ai",
            proxy: undefined,
        });
    });

    it("includes the proxy config when all public-exposure vars are set", () => {
        const result = requireAppDeployConfig({
            CF_WORKER_DEPLOY_ACCOUNT_ID: "acct",
            CF_WORKER_DEPLOY_API_TOKEN: "token",
            CF_APP_ORIGIN_ZONE_ID: "zone",
            CF_APP_ORIGIN_DOMAIN: "myceli.ai",
            CF_APP_PUBLIC_DOMAIN: "pollinations.ai",
            CF_PROXY_DEPLOY_ACCOUNT_ID: "old-acct",
            CF_PROXY_DEPLOY_API_TOKEN: "old-token",
            CF_APP_PUBLIC_ZONE_ID: "public-zone",
            CF_APP_PROXY_SERVICE: "pollinations-proxy",
        });
        expect(result.proxy).toEqual({
            accountId: "old-acct",
            apiToken: "old-token",
            publicZoneId: "public-zone",
            proxyService: "pollinations-proxy",
        });
    });

    it("throws when public exposure is partially configured", () => {
        expect(() =>
            requireAppDeployConfig({
                CF_WORKER_DEPLOY_ACCOUNT_ID: "acct",
                CF_WORKER_DEPLOY_API_TOKEN: "token",
                CF_APP_ORIGIN_ZONE_ID: "zone",
                CF_APP_ORIGIN_DOMAIN: "myceli.ai",
                CF_APP_PUBLIC_DOMAIN: "pollinations.ai",
                CF_PROXY_DEPLOY_ACCOUNT_ID: "old-acct",
            }),
        ).toThrow(/partially configured/);
    });
});

describe("decodeAppFiles", () => {
    it("normalizes paths and decodes base64", () => {
        const files = decodeAppFiles({
            "index.html": encode("<h1>hi</h1>"),
            "/assets/main.js": encode("console.log(1)"),
        });
        expect(files.map((file) => file.path)).toEqual([
            "/index.html",
            "/assets/main.js",
        ]);
        expect(atob(files[0].base64)).toBe("<h1>hi</h1>");
        expect(files[0].size).toBe("<h1>hi</h1>".length);
    });

    it("rejects traversal, duplicates, bad base64 and empty input", () => {
        expect(() => decodeAppFiles({})).toThrow(/At least one file/);
        expect(() => decodeAppFiles({ "../evil.html": encode("x") })).toThrow(
            /Invalid file path/,
        );
        expect(() => decodeAppFiles({ "a//b.html": encode("x") })).toThrow(
            /Invalid file path/,
        );
        expect(() =>
            decodeAppFiles({
                "a.html": encode("x"),
                "/a.html": encode("y"),
            }),
        ).toThrow(/Duplicate file path/);
        expect(() => decodeAppFiles({ "a.html": "%%%" })).toThrow(
            /not valid base64/,
        );
    });

    it("enforces the total size cap from the encoded length before decoding", () => {
        // Each base64 blob is >2x MAX once, so the pre-decode guard trips on
        // the encoded length rather than after inflating everything in memory.
        const chunk = "a".repeat(MAX_APP_TOTAL_BYTES * 2 + 8);
        expect(() => decodeAppFiles({ "big.txt": chunk })).toThrow(
            /total size limit/,
        );
    });
});

describe("deployAppWorker", () => {
    it("runs the session -> upload -> upsert flow", async () => {
        const files = decodeAppFiles({ "index.html": encode("<h1>hi</h1>") });
        const calls: Request[] = [];
        let manifestHash = "";
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            calls.push(request);
            if (request.url.endsWith("/assets-upload-session")) {
                expect(request.method).toBe("POST");
                expect(request.url).toBe(
                    "https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/app-123/assets-upload-session",
                );
                expect(request.headers.get("authorization")).toBe(
                    "Bearer cf_token",
                );
                const body = (await request.json()) as {
                    manifest: Record<string, { hash: string; size: number }>;
                };
                const entry = body.manifest["/index.html"];
                expect(entry).toBeDefined();
                expect(entry.hash).toMatch(/^[0-9a-f]{32}$/);
                expect(entry.size).toBe("<h1>hi</h1>".length);
                manifestHash = entry.hash;
                return Response.json({
                    success: true,
                    result: {
                        jwt: "session-jwt",
                        buckets: [[entry.hash]],
                    },
                });
            }
            if (request.url.includes("/workers/assets/upload")) {
                expect(request.url).toContain("base64=true");
                expect(request.headers.get("authorization")).toBe(
                    "Bearer session-jwt",
                );
                const form = await request.formData();
                const part = form.get(manifestHash) as File;
                expect(part).toBeInstanceOf(File);
                expect(part.type).toContain("text/html");
                expect(await part.text()).toBe(encode("<h1>hi</h1>"));
                return Response.json(
                    { success: true, result: { jwt: "completion-jwt" } },
                    { status: 201 },
                );
            }
            expect(request.method).toBe("PUT");
            expect(request.url).toBe(
                "https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/app-123",
            );
            const form = await request.formData();
            const metadata = JSON.parse(form.get("metadata") as string);
            expect(metadata).toEqual({
                compatibility_date: "2026-01-01",
                assets: {
                    jwt: "completion-jwt",
                    config: {
                        html_handling: "auto-trailing-slash",
                        not_found_handling: "single-page-application",
                    },
                },
            });
            return Response.json({ success: true, result: {} });
        });
        vi.stubGlobal("fetch", fetchMock);

        await deployAppWorker(config, "app-123", files);
        expect(calls).toHaveLength(3);
    });

    it("uses the session token as completion token when no buckets are returned", async () => {
        const files = decodeAppFiles({ "index.html": encode("<h1>hi</h1>") });
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (request.url.endsWith("/assets-upload-session")) {
                return Response.json({
                    success: true,
                    result: { jwt: "session-jwt", buckets: [] },
                });
            }
            const form = await request.formData();
            const metadata = JSON.parse(form.get("metadata") as string);
            expect(metadata.assets.jwt).toBe("session-jwt");
            return Response.json({ success: true, result: {} });
        });
        vi.stubGlobal("fetch", fetchMock);

        await deployAppWorker(config, "app-123", files);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("fails when an upload response never carries a completion token", async () => {
        const files = decodeAppFiles({ "index.html": encode("<h1>hi</h1>") });
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (request.url.endsWith("/assets-upload-session")) {
                const body = (await request.json()) as {
                    manifest: Record<string, { hash: string }>;
                };
                return Response.json({
                    success: true,
                    result: {
                        jwt: "session-jwt",
                        buckets: [[Object.values(body.manifest)[0].hash]],
                    },
                });
            }
            return Response.json(
                { success: true, result: {} },
                { status: 202 },
            );
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(deployAppWorker(config, "app-123", files)).rejects.toThrow(
            /no asset completion token/,
        );
    });
});

describe("app domains", () => {
    it("attaches the hostname without override flags", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.method).toBe("PUT");
            expect(request.url).toBe(
                "https://api.cloudflare.com/client/v4/accounts/acct/workers/domains",
            );
            await expect(request.json()).resolves.toEqual({
                zone_id: "zone",
                hostname: "my-app.myceli.ai",
                service: "app-123",
            });
            return Response.json({ success: true, result: { id: "dom" } });
        });
        vi.stubGlobal("fetch", fetchMock);

        await attachAppDomain(config, "my-app.myceli.ai", "app-123");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("detaches only a hostname owned by the given script", async () => {
        const deleted: string[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (request.method === "GET") {
                return Response.json({
                    success: true,
                    result: [
                        { id: "other", service: "app-someone-else" },
                        { id: "mine", service: "app-123" },
                    ],
                });
            }
            expect(request.method).toBe("DELETE");
            deleted.push(request.url);
            return new Response(null, { status: 200 });
        });
        vi.stubGlobal("fetch", fetchMock);

        await detachAppDomain(config, "my-app.myceli.ai", "app-123");
        expect(deleted).toEqual([
            "https://api.cloudflare.com/client/v4/accounts/acct/workers/domains/mine",
        ]);
    });

    it("treats an unattached hostname as success", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({ success: true, result: [] }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            detachAppDomain(config, "my-app.myceli.ai", "app-123"),
        ).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("public domains", () => {
    it("is a no-op when public exposure is not configured", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await attachPublicDomain(config, "my-app.pollinations.ai");
        await detachPublicDomain(config, "my-app.pollinations.ai");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("attaches the public host to the proxy account/service", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.cloudflare.com/client/v4/accounts/old-acct/workers/domains",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer old_token",
            );
            await expect(request.json()).resolves.toEqual({
                zone_id: "public-zone",
                hostname: "my-app.pollinations.ai",
                service: "pollinations-proxy",
            });
            return Response.json({ success: true, result: { id: "pd" } });
        });
        vi.stubGlobal("fetch", fetchMock);

        await attachPublicDomain(proxyConfig, "my-app.pollinations.ai");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("detaches only a public host owned by the proxy service", async () => {
        const deleted: string[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (request.method === "GET") {
                expect(request.url).toContain("/accounts/old-acct/");
                return Response.json({
                    success: true,
                    result: [
                        { id: "other", service: "someone-else" },
                        { id: "mine", service: "pollinations-proxy" },
                    ],
                });
            }
            deleted.push(request.url);
            return new Response(null, { status: 200 });
        });
        vi.stubGlobal("fetch", fetchMock);

        await detachPublicDomain(proxyConfig, "my-app.pollinations.ai");
        expect(deleted).toEqual([
            "https://api.cloudflare.com/client/v4/accounts/old-acct/workers/domains/mine",
        ]);
    });
});

describe("naming", () => {
    it("derives the script name from the app id", () => {
        expect(appWorkerScriptName("123")).toBe("app-123");
    });

    it("returns the origin URL when public exposure is off", () => {
        // Without a proxy binding the public host is never attached, so the
        // reachable URL is the origin host, not a pollinations.ai one.
        expect(appPublicUrl(config, "my-app")).toBe("https://my-app.myceli.ai");
    });

    it("returns the public URL when public exposure is configured", () => {
        expect(appPublicUrl(proxyConfig, "my-app")).toBe(
            "https://my-app.pollinations.ai",
        );
    });
});
