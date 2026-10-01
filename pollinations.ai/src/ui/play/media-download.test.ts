import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMedia } from "./media-download";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("downloadMedia", () => {
    it.each([
        [
            "https://media.pollinations.ai/example",
            "audio/mpeg",
            "pollinations-audio",
            "pollinations-audio.mp3",
        ],
        ["blob:local-result", "image/png", "result.png", "result.png"],
        [
            "data:text/plain,hello",
            "text/plain;charset=utf-8",
            "transcript",
            "transcript.txt",
        ],
    ])("saves %s as a Blob download and releases it", async (source, contentType, filename, expectedName) => {
        vi.useFakeTimers();
        const fetchFile = vi.fn().mockResolvedValue(
            new Response("file bytes", {
                headers: { "Content-Type": contentType },
            }),
        );
        const click = vi.fn();
        const remove = vi.fn();
        const link = { href: "", download: "", hidden: false, click, remove };
        const append = vi.fn();
        vi.stubGlobal("fetch", fetchFile);
        vi.stubGlobal("document", {
            createElement: vi.fn().mockReturnValue(link),
            body: { append },
        });
        vi.stubGlobal("window", { setTimeout });
        const createUrl = vi
            .spyOn(URL, "createObjectURL")
            .mockReturnValue("blob:download");
        const revokeUrl = vi
            .spyOn(URL, "revokeObjectURL")
            .mockImplementation(() => undefined);
        const signal = new AbortController().signal;

        await downloadMedia(source, filename, signal);

        expect(fetchFile).toHaveBeenCalledWith(source, {
            signal,
            credentials: "omit",
        });
        expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
        expect(link.href).toBe("blob:download");
        expect(link.download).toBe(expectedName);
        expect(append).toHaveBeenCalledWith(link);
        expect(click).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
        expect(revokeUrl).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        expect(revokeUrl).toHaveBeenCalledWith("blob:download");
    });

    it("reports a failed download instead of navigating to an error page", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(new Response("Not found", { status: 404 })),
        );
        const createUrl = vi.spyOn(URL, "createObjectURL");
        await expect(
            downloadMedia(
                "https://media.pollinations.ai/missing",
                "image",
                new AbortController().signal,
            ),
        ).rejects.toThrow("Could not download this file. Try again.");
        expect(createUrl).not.toHaveBeenCalled();
    });

    it("does not start an aborted download", async () => {
        const fetchFile = vi.fn();
        vi.stubGlobal("fetch", fetchFile);
        const controller = new AbortController();
        controller.abort();
        await expect(
            downloadMedia(
                "https://media.pollinations.ai/example",
                "image",
                controller.signal,
            ),
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(fetchFile).not.toHaveBeenCalled();
    });
});
