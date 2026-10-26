import { afterEach, expect, it, vi } from "vitest";
import { setOutputMode } from "../lib/output.js";
import { modelsCommand } from "./models.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setOutputMode("human");
});

it("passes filters to /models and matches --type on category", async () => {
    // gpt-audio outputs audio but is a text model.
    const gptAudio = {
        name: "openai/gpt-audio-mini",
        category: "text",
        output_modalities: ["audio", "text"],
    };
    const fetch = vi
        .fn()
        .mockResolvedValue(
            Response.json([{ name: "flux", category: "image" }, gptAudio]),
        );
    vi.stubGlobal("fetch", fetch);
    const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    setOutputMode("json");

    await modelsCommand.parseAsync(
        [
            "audio",
            "--source",
            "official",
            "--reliability",
            "all",
            "--type",
            "text",
        ],
        { from: "user" },
    );

    expect(String(fetch.mock.calls[0][0])).toMatch(
        /\/models\?query=audio&source=official&reliability=all$/,
    );
    expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual([gptAudio]);
});
