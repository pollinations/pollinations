import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    type ConnectDrafts,
    saveConnectDraft,
    takeConnectDraft,
} from "./connect-draft";

const key = "play-connect-draft";
const tab = new Map<string, string>();
const recording = new File([new Uint8Array([0, 255, 128])], "voice.wav", {
    type: "audio/wav",
    lastModified: 73,
});
const selection: ConnectDrafts = {
    audio: {
        params: { model: "zyphra/zonos3-mini", prompt: "Hello" },
        referenceImages: [],
        videoReferences: [],
        audioFiles: [recording],
    },
};

beforeEach(() => {
    tab.clear();
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => tab.get(key) ?? null,
        setItem: (key: string, value: string) => tab.set(key, value),
        removeItem: (key: string) => tab.delete(key),
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function storedKeys(): Promise<IDBValidKey[]> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(key);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const read = db
                .transaction("drafts")
                .objectStore("drafts")
                .getAllKeys();
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
            db.close();
        };
    });
}

it("restores the recording bytes, file metadata and prompt once", async () => {
    await saveConnectDraft(selection);
    const restored = (await takeConnectDraft())?.audio;
    expect(restored?.params).toEqual(selection.audio?.params);
    const file = restored?.audioFiles[0];
    expect(file).toMatchObject({
        name: recording.name,
        type: recording.type,
        lastModified: recording.lastModified,
    });
    expect(await file?.arrayBuffer()).toEqual(await recording.arrayBuffer());
    expect(await storedKeys()).toEqual([]);
    expect(await takeConnectDraft()).toBeUndefined();
});

it("preserves separate drafts for tasks with the same media type", async () => {
    await saveConnectDraft({
        transcription: {
            ...selection.audio,
            params: { task: "transcription", language: "fr" },
        },
        "stem-separation": {
            ...selection.audio,
            params: { task: "stem-separation", stems: "2" },
            audioFiles: [],
        },
    });
    const drafts = await takeConnectDraft();
    expect(drafts?.transcription.params.language).toBe("fr");
    expect(drafts?.transcription.audioFiles[0].name).toBe(recording.name);
    expect(drafts?.["stem-separation"].params.stems).toBe("2");
    expect(drafts?.["stem-separation"].audioFiles).toEqual([]);
});

it("restores mixed reference files in selection order", async () => {
    const videoReferences = [
        { id: "1", media: "audio", file: recording },
        { id: "2", media: "image", file: new File([], "scene.png") },
        { id: "3", media: "audio", file: recording },
    ] satisfies ConnectDrafts["video"]["videoReferences"];
    await saveConnectDraft({ video: { ...selection.audio, videoReferences } });
    const restored = (await takeConnectDraft())?.video.videoReferences;
    expect(
        restored?.map(({ id, media, file }) => [id, media, file.name]),
    ).toEqual([
        ["1", "audio", "voice.wav"],
        ["2", "image", "scene.png"],
        ["3", "audio", "voice.wav"],
    ]);
});

it.each(["frames", "references"])(
    "restores the active uploads from an older %s draft",
    async (guidance) => {
        const params = { model: "bytedance/seedance-2.5", guidance };
        await saveConnectDraft({
            video: {
                params,
                referenceImages: [new File(["frame"], "first.png")],
                videoReferences: [
                    { id: "voice", media: "audio", file: recording },
                ],
                audioFiles: [],
            },
        });
        const restored = (await takeConnectDraft())?.video;
        expect(restored?.referenceImages.map((file) => file.name)).toEqual(
            guidance === "frames" ? ["first.png"] : [],
        );
        expect(restored?.videoReferences.map(({ file }) => file.name)).toEqual(
            guidance === "references" ? [recording.name] : [],
        );
    },
);

it("a fresh tab sweeps an abandoned expired draft while preserving a live tab's draft", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await saveConnectDraft(selection);
    tab.clear();
    clock.mockReturnValue(now + 20 * 60_000);
    await saveConnectDraft(selection);
    const live = tab.get(key);
    tab.clear();
    clock.mockReturnValue(now + 31 * 60_000);
    expect(await takeConnectDraft()).toBeUndefined();
    await expect.poll(storedKeys).toEqual([live]);
});
