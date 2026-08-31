import { afterEach, describe, expect, it, vi } from "vitest";
import { gen } from "../lib/api.js";
import { setKeyOverride } from "../lib/config.js";
import { fetchHarnessModels } from "./models.js";

const response = {
    data: [
        {
            id: "model",
            input_modalities: ["text"],
            output_modalities: ["text"],
            supported_endpoints: ["/v1/chat/completions"],
            tools: true,
            context_length: 100,
        },
    ],
};

afterEach(() => {
    vi.unstubAllGlobals();
    setKeyOverride("");
});

describe("fetchHarnessModels", () => {
    it("keeps public catalog preflights unauthenticated for empty, null, and undefined keys", async () => {
        const authorization: (string | null)[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                authorization.push(
                    new Headers(init?.headers).get("Authorization"),
                );
                return {
                    ok: true,
                    json: async () => response,
                };
            }),
        );

        await fetchHarnessModels("");
        await fetchHarnessModels(null);
        await fetchHarnessModels(undefined);

        expect(authorization).toEqual([null, null, null]);
    });

    it("does not change generic API-key inheritance when no override is passed", async () => {
        const authorization: (string | null)[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                authorization.push(
                    new Headers(init?.headers).get("Authorization"),
                );
                return {
                    ok: true,
                    json: async () => response,
                };
            }),
        );
        setKeyOverride("sk_inherited");

        await gen("/v1/models");

        expect(authorization).toEqual(["Bearer sk_inherited"]);
    });
});
