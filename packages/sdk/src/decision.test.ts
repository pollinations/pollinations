import { afterEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import { configure, decision, resetClient } from "./helpers.js";

const response = {
    id: "dec-1",
    model: "typesafe/jev-1.13",
    provider: "TypeSafe",
    answers: { urgent: { type: "noul", noul: 0.9 } },
    usage: { input_tokens: 10, output_tokens: 1 },
};
const questions = {
    urgent: { type: "noul" as const, instructions: "Is this urgent?" },
};

afterEach(() => {
    resetClient();
    vi.unstubAllGlobals();
});

describe("decisions", () => {
    it("forwards the native request, including object-valued state", async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn(async () =>
            Response.json(response),
        );
        vi.stubGlobal("fetch", fetchMock);
        const client = new Pollinations({
            apiKey: "sk_test",
            baseUrl: "https://example.test",
        });
        const state = { state: "nested", questions: ["preserve this"] };

        expect(await client.decision({ state, questions })).toEqual(response);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/alpha/decisions");
        expect(init.method).toBe("POST");
        expect(init.headers.Authorization).toBe("Bearer sk_test");
        expect(JSON.parse(init.body)).toEqual({ state, questions });
    });

    it("passes an explicit model through the top-level helper", async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn(async () =>
            Response.json(response),
        );
        vi.stubGlobal("fetch", fetchMock);
        configure({ apiKey: "sk_test", baseUrl: "https://example.test" });

        expect(
            await decision({
                state: "A delayed invoice",
                questions,
                model: "jev",
            }),
        ).toEqual(response);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            state: "A delayed invoice",
            questions,
            model: "jev",
        });
    });
});
