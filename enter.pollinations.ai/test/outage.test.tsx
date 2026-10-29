import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadError } from "../frontend/src/components/layout/dashboard-loading.tsx";
import { isOutageStatus, trackedFetch } from "../frontend/src/lib/outage.ts";

vi.mock("../frontend/src/config.ts", () => ({
    config: { apiBaseUrl: "/api", genBaseUrl: "https://gen.example" },
    genDocsUrl: (hash = "") => `https://gen.example/docs${hash}`,
}));

const OUTAGE_TEXT = "Pollinations is having a temporary outage";

// The keys panel, which loads only /account/keys.
function render() {
    return renderToStaticMarkup(
        <LoadError onRetry={() => {}} paths={["/account/keys"]}>
            Couldn’t load keys.
        </LoadError>,
    );
}

function respond(status: number) {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(null, { status }),
    );
}

describe("dashboard outage state", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {
            location: { href: "https://enter.example/keys" },
        });
    });

    afterEach(async () => {
        // The store is shared: answer every path the tests failed.
        for (const url of [
            "https://gen.example/account/keys",
            "https://gen.example/account/profile",
            "https://enter.example/api/session-token",
        ]) {
            respond(200);
            await trackedFetch(url);
        }
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([500, 503])(
        "shows the outage notice after a %i until the path answers",
        async (status) => {
            respond(status);
            await trackedFetch("https://gen.example/account/keys");
            expect(render()).toContain(OUTAGE_TEXT);
            expect(render()).toContain("Retrying automatically.");

            respond(200);
            await trackedFetch("https://gen.example/account/keys");
            expect(render()).toContain("Couldn’t load keys.");
        },
    );

    it("shows the outage notice when a request gets no response", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
            new TypeError("Failed to fetch"),
        );
        await expect(
            trackedFetch("https://gen.example/account/keys"),
        ).rejects.toThrow("Failed to fetch");
        expect(render()).toContain(OUTAGE_TEXT);
    });

    it.each([401, 403])("keeps the usual error after a %i", async (status) => {
        respond(status);
        await trackedFetch("https://gen.example/account/keys");
        expect(render()).toContain("Couldn’t load keys.");
        expect(render()).not.toContain(OUTAGE_TEXT);
    });

    it("keeps a permission error when a different request is down", async () => {
        respond(503);
        await trackedFetch("https://gen.example/account/profile");
        respond(403);
        await trackedFetch("https://gen.example/account/keys");
        expect(render()).toContain("Couldn’t load keys.");
        expect(render()).not.toContain(OUTAGE_TEXT);
    });

    it("counts a 401 without a token as an outage when minting failed", async () => {
        respond(500);
        await trackedFetch("https://enter.example/api/session-token");
        respond(401);
        await trackedFetch("https://gen.example/account/keys");
        expect(render()).toContain(OUTAGE_TEXT);
    });

    it("ignores a request the page aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
            new DOMException("Aborted", "AbortError"),
        );
        await expect(
            trackedFetch("https://gen.example/account/keys", {
                signal: controller.signal,
            }),
        ).rejects.toThrow();
        expect(render()).not.toContain(OUTAGE_TEXT);
    });

    it("treats a session read with no status or a 5xx as an outage", () => {
        expect(isOutageStatus(undefined)).toBe(true);
        expect(isOutageStatus(500)).toBe(true);
        expect(isOutageStatus(401)).toBe(false);
        expect(isOutageStatus(403)).toBe(false);
    });
});
