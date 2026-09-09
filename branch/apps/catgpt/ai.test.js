import { afterEach, expect, it, vi } from "vitest";
import { pickModel } from "./ai.js";

afterEach(() => vi.unstubAllGlobals());

it.each([
    { name: "nanobanana", aliases: [] },
    { name: "google/gemini-2.5-flash-image", aliases: ["nanobanana"] },
])("keeps premium selection for either catalog spelling", async (model) => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json([model])),
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
