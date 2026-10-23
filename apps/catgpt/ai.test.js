import { afterEach, expect, it, vi } from "vitest";
import { pickModel } from "./ai.js";

afterEach(() => vi.unstubAllGlobals());

it.each([
    { name: "nanobanana-2-lite", aliases: [] },
    {
        name: "google/gemini-3.1-flash-lite-image",
        aliases: ["nanobanana-2-lite"],
    },
])("keeps premium selection for either catalog spelling", async (model) => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json([model])),
    );
    expect(await pickModel("test-key")).toEqual({
        model: "nanobanana-2-lite",
        isPremium: true,
    });
});

it("falls back to nanobanana when nanobanana-2-lite is unavailable", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            Response.json([
                {
                    name: "google/gemini-2.5-flash-image",
                    aliases: ["nanobanana"],
                },
            ]),
        ),
    );
    expect(await pickModel("test-key")).toEqual({
        model: "nanobanana",
        isPremium: true,
    });
});

it("uses the existing fallback when the preferred model is unavailable", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json([{ name: "unrelated", aliases: [] }])),
    );
    expect(await pickModel("test-key")).toEqual({
        model: "gptimage",
        isPremium: false,
    });
});
