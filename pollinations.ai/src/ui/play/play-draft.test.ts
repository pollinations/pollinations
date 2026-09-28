import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAY_DRAFT_TTL_MS, readPlayDraft, savePlayDraft } from "./play-draft";

const defaults = {
    prompt: "",
    selectedModel: "",
    duration: 5,
    hadAttachments: false,
    agent: null as string | null,
};
let stored: Map<string, string>;

beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("window", {
        sessionStorage: {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => stored.set(key, value),
            removeItem: (key: string) => stored.delete(key),
        },
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("Play session drafts", () => {
    it("restores text, choices and settings without consuming them during render", () => {
        const draft = {
            prompt: "A test melody",
            selectedModel: "music-model",
            duration: 10,
            hadAttachments: true,
            agent: "agent-id",
        };
        expect(savePlayDraft("media", draft)).toBe(true);
        expect(readPlayDraft("media", defaults)).toEqual(draft);
        expect(readPlayDraft("media", defaults)).toEqual(draft);
        expect(readPlayDraft("chat", defaults)).toEqual(defaults);
    });

    it("replaces an old draft when the text is cleared", () => {
        savePlayDraft("chat", { ...defaults, prompt: "Old draft" });
        savePlayDraft("chat", defaults);
        expect(readPlayDraft("chat", defaults).prompt).toBe("");
    });

    it("expires drafts after 30 minutes", () => {
        vi.useFakeTimers();
        savePlayDraft("media", { ...defaults, prompt: "Temporary draft" });
        vi.advanceTimersByTime(PLAY_DRAFT_TTL_MS - 1);
        expect(readPlayDraft("media", defaults).prompt).toBe("Temporary draft");
        vi.advanceTimersByTime(1);
        expect(readPlayDraft("media", defaults)).toEqual(defaults);
    });

    it.each([
        "broken json",
        "null",
        "[]",
        JSON.stringify({ savedAt: "bad", values: defaults }),
        JSON.stringify({ savedAt: Date.now() + 60_000, values: defaults }),
    ])("ignores corrupt or invalid storage: %s", (raw) => {
        stored.set("pollinations:play:media:v1", raw);
        expect(readPlayDraft("media", defaults)).toEqual(defaults);
    });

    it("keeps only expected primitive fields, not files or response history", () => {
        stored.set(
            "pollinations:play:media:v1",
            JSON.stringify({
                savedAt: Date.now(),
                values: {
                    prompt: { unexpected: true },
                    selectedModel: "saved-model",
                    duration: "bad",
                    hadAttachments: "yes",
                    agent: [],
                    files: ["file contents"],
                    messages: ["response"],
                },
            }),
        );
        expect(readPlayDraft("media", defaults)).toEqual({
            ...defaults,
            selectedModel: "saved-model",
        });
    });

    it("handles blocked storage without crashing", () => {
        vi.stubGlobal("window", {
            get sessionStorage() {
                throw new Error("Blocked");
            },
        });
        expect(readPlayDraft("chat", defaults)).toEqual(defaults);
        expect(savePlayDraft("chat", defaults)).toBe(false);
    });

    it("rejects oversized drafts and removes any stale saved text", () => {
        savePlayDraft("chat", { ...defaults, prompt: "Old draft" });
        expect(
            savePlayDraft("chat", {
                ...defaults,
                prompt: "x".repeat(128 * 1024),
            }),
        ).toBe(false);
        expect(readPlayDraft("chat", defaults)).toEqual(defaults);
    });

    it("works without browser globals during server rendering", () => {
        vi.stubGlobal("window", undefined);
        expect(readPlayDraft("chat", defaults)).toEqual(defaults);
    });
});
