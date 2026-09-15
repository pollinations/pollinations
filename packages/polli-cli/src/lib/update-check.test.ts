import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setOutputMode } from "./output.js";
import {
    checkForUpdate,
    fetchLatestVersion,
    formatUpdateNotice,
    isNewerVersion,
} from "./update-check.js";

afterEach(() => {
    vi.restoreAllMocks();
    setOutputMode("human");
    delete process.env.POLLI_NO_UPDATE_NOTICES;
});

const tempCache = (): string =>
    join(mkdtempSync(join(tmpdir(), "polli-update-")), "update-check.json");

describe("isNewerVersion", () => {
    it("detects higher versions component-wise", () => {
        expect(isNewerVersion("0.1.16", "0.1.15")).toBe(true);
        expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
        expect(isNewerVersion("0.2.0", "0.1.99")).toBe(true);
    });

    it("ignores prerelease tags when comparing against the stable range", () => {
        expect(isNewerVersion("0.1.16-alpha.1", "0.1.15")).toBe(true);
        expect(isNewerVersion("0.1.15-alpha.1", "0.1.15")).toBe(false);
    });

    it("returns false for equal, older, or malformed versions", () => {
        expect(isNewerVersion("0.1.15", "0.1.15")).toBe(false);
        expect(isNewerVersion("0.1.14", "0.1.15")).toBe(false);
        expect(isNewerVersion("not-a-version", "0.1.15")).toBe(false);
        expect(isNewerVersion("0.1.16", "")).toBe(false);
    });
});

describe("fetchLatestVersion", () => {
    it("returns the registry version string on success", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ version: "9.9.9" }) as Response,
        );
        expect(await fetchLatestVersion()).toBe("9.9.9");
    });

    it("returns null on network failure instead of throwing", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
        expect(await fetchLatestVersion()).toBeNull();
    });

    it("returns null on unexpected response payloads", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ version: 42 }) as Response,
        );
        expect(await fetchLatestVersion()).toBeNull();
    });
});

describe("checkForUpdate", () => {
    it("returns a notice with both versions when the registry is newer", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ version: "0.1.16" }) as Response,
        );
        const notice = await checkForUpdate("0.1.15", tempCache());
        expect(notice).toContain("0.1.15");
        expect(notice).toContain("0.1.16");
        expect(notice).toContain("polli update");
    });

    it("stays silent when already current, without printing anything", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ version: "0.1.15" }) as Response,
        );
        expect(await checkForUpdate("0.1.15", tempCache())).toBeNull();
    });

    it("stays silent when offline (commands never fail because of the check)", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
        expect(await checkForUpdate("0.1.15", tempCache())).toBeNull();
    });

    it("reuses the daily cache without hitting the network again", async () => {
        const file = tempCache();
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({ version: "0.1.16" }) as Response,
            );

        const first = await checkForUpdate("0.1.15", file);
        expect(first).toContain("0.1.16");

        fetchMock.mockClear();
        const second = await checkForUpdate("0.1.15", file);
        expect(second).toContain("0.1.16");
        expect(fetchMock).not.toHaveBeenCalled();

        // Cache records the fetched version and a timestamp.
        const cached = JSON.parse(readFileSync(file, "utf-8")) as {
            latest: string;
            checkedAt: number;
        };
        expect(cached.latest).toBe("0.1.16");
        expect(cached.checkedAt).toBeGreaterThan(0);
    });

    it("is skipped entirely in JSON output mode", async () => {
        setOutputMode("json");
        const fetchMock = vi.spyOn(globalThis, "fetch");
        expect(await checkForUpdate("0.1.15", tempCache())).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("can be disabled with POLLI_NO_UPDATE_NOTICES", async () => {
        process.env.POLLI_NO_UPDATE_NOTICES = "1";
        const fetchMock = vi.spyOn(globalThis, "fetch");
        expect(await checkForUpdate("0.1.15", tempCache())).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("formatUpdateNotice", () => {
    it("shows current → latest, the update command, and the opt-out", () => {
        const notice = formatUpdateNotice("0.1.15", "0.1.16");
        expect(notice).toContain("0.1.15 → 0.1.16");
        expect(notice).toContain("polli update");
        expect(notice).toContain("npm i -g @pollinations/cli@latest");
        expect(notice).toContain("POLLI_NO_UPDATE_NOTICES=1");
    });
});
