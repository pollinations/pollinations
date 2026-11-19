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
        videoReferences: { image: [], video: [], audio: [] },
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
        "audio-processing": {
            ...selection.audio,
            params: { task: "audio-processing", stems: "2" },
            audioFiles: [],
        },
    });
    const drafts = await takeConnectDraft();
    expect(drafts?.transcription.params.language).toBe("fr");
    expect(drafts?.transcription.audioFiles[0].name).toBe(recording.name);
    expect(drafts?.["audio-processing"].params.stems).toBe("2");
    expect(drafts?.["audio-processing"].audioFiles).toEqual([]);
});

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
