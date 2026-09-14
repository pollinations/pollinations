import { describe, expect, it } from "vitest";
import { detectInstall } from "./update.js";

describe("detectInstall", () => {
    it("detects npx cache installs", () => {
        expect(
            detectInstall(
                "/home/user/.npm/_npx/abc123/node_modules/.bin/polli",
                "/usr/local",
            ),
        ).toBe("npx");
    });

    it("detects npm global installs under the global prefix", () => {
        expect(
            detectInstall(
                "/usr/local/lib/node_modules/@pollinations/cli/bin/polli.js",
                "/usr/local",
            ),
        ).toBe("npm-global");
    });

    it("detects Windows global installs with backslashes", () => {
        expect(
            detectInstall(
                "C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@pollinations\\cli\\bin\\polli.js",
                "C:\\Users\\u\\AppData\\Roaming\\npm",
            ),
        ).toBe("npm-global");
    });

    it("detects project-local installs outside the global prefix", () => {
        expect(
            detectInstall(
                "/home/user/project/node_modules/@pollinations/cli/bin/polli.js",
                "/usr/local",
            ),
        ).toBe("local");
    });

    it("falls back to unknown when the path matches nothing", () => {
        expect(detectInstall("/opt/bin/polli", "/usr/local")).toBe("unknown");
        expect(detectInstall("", undefined)).toBe("unknown");
    });
});
