import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockVcr } from "@shared/test/mocks/vcr.ts";
import { afterEach, describe, expect, inject, it } from "vitest";

const snapshotServerUrl = inject("snapshotServerUrl");

afterEach(async () => {
    await teardownFetchMock();
});

describe("VCR snapshots", () => {
    it("replays snapshots from gen's snapshot directory", async () => {
        const mocks = createFetchMock({
            vcr: createMockVcr({
                originalFetch: async () => new Response("live response"),
                hosts: [{ name: "text", host: "text.test" }],
                snapshotServerUrl,
                mode: "replay-only",
            }),
        });

        await mocks.enable("vcr");

        const response = await fetch("https://text.test/status?case=vcr");

        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toBe("snapshot response");
    });
});
