import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock i18next before importing the module
vi.mock("i18next", () => {
    const mockT = vi.fn((key: string, params?: Record<string, string | number>) => {
        if (key === "cli.description") return "The Pollinations CLI — for humans, AI agents, and everything in between";
        if (key === "auth.login.success") return "Authenticated. Key stored.";
        if (key === "auth.status.name") return `Logged in as ${params?.name ?? "unknown"}`;
        if (key === "gen.generating") return `Generating ${params?.type ?? "unknown"}...`;
        if (key === "error.insufficient") return "Insufficient pollen balance.";
        if (key === "gen.saved") return `Saved to ${params?.path ?? "?"}`;
        if (key === "gen.audio.player_missing") return "No mp3-capable player found. Install one of: ffmpeg (ffplay), mpv, or mpg123.";
        if (key === "chat.ended") return `Session ended. ${params?.tokens ?? 0} tokens used.`;
        return key;
    });

    const mockI18next = {
        use: vi.fn().mockReturnThis(),
        init: vi.fn().mockResolvedValue(undefined),
        t: mockT,
        changeLanguage: vi.fn(),
    };

    return {
        default: mockI18next,
        ...mockI18next,
    };
});

vi.mock("i18next-fs-backend", () => ({
    default: {},
}));

describe("i18n", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("initI18n", () => {
        it("should initialize i18n", async () => {
            const { initI18n } = await import("../../lib/i18n.js");
            await initI18n("en");
            // Should not throw
        });
    });

    describe("t", () => {
        it("should translate a simple key", async () => {
            const { t } = await import("../../lib/i18n.js");
            const result = t("cli.description");
            expect(result).toBe("The Pollinations CLI — for humans, AI agents, and everything in between");
        });

        it("should translate with interpolation parameters", async () => {
            const { t } = await import("../../lib/i18n.js");
            const result = t("auth.status.name", { name: "Diego" });
            expect(result).toBe("Logged in as Diego");
        });

        it("should translate with type parameter", async () => {
            const { t } = await import("../../lib/i18n.js");
            const result = t("gen.generating", { type: "image" });
            expect(result).toBe("Generating image...");
        });

        it("should translate with numeric parameters", async () => {
            const { t } = await import("../../lib/i18n.js");
            const result = t("chat.ended", { tokens: 42 });
            expect(result).toBe("Session ended. 42 tokens used.");
        });

        it("should return key if translation not found", async () => {
            const { t } = await import("../../lib/i18n.js");
            const result = t("nonexistent.key");
            expect(result).toBe("nonexistent.key");
        });
    });

    describe("setLocale", () => {
        it("should change the language", async () => {
            const { setLocale } = await import("../../lib/i18n.js");
            const i18next = await import("i18next");
            setLocale("es");
            expect(i18next.default.changeLanguage).toHaveBeenCalledWith("es");
        });
    });
});
