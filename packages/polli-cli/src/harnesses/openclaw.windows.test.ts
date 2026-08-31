import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runOpenclawOnboarding } from "./openclaw.js";
import type { HarnessContext } from "./types.js";

let temp: string | undefined;

afterEach(() => {
    if (temp) rmSync(temp, { recursive: true, force: true });
    temp = undefined;
});

describe("OpenClaw Windows invocation", () => {
    it.skipIf(process.platform !== "win32")(
        "executes a .cmd wrapper with static onboarding args",
        () => {
            temp = mkdtempSync(join(tmpdir(), "openclaw wrapper "));
            const wrapper = join(temp, "openclaw.cmd");
            const captured = join(temp, "args.txt");
            writeFileSync(
                wrapper,
                `@echo off\r\n> "%~dp0args.txt" echo %*\r\n`,
            );
            const ctx: HarnessContext = {
                home: temp,
                env: { PATH: temp },
            };

            runOpenclawOnboarding(ctx);

            const args = readFileSync(captured, "utf8");
            expect(args).toContain("onboard");
            expect(args).toContain("--custom-provider-id pollinations");
            expect(args).toContain(`\${POLLI_OPENCLAW_API_KEY}`);
            expect(args).not.toContain("sk_");
        },
    );
});
