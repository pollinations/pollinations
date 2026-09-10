import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    bloom,
    bloomHome,
    configureBloom,
    disableBloom,
} from "./bloom.js";
import type { HarnessContext } from "./types.js";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-bloom-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const envFile = () => join(home, ".bloom", ".env");
const read = (path: string) => readFileSync(path, "utf-8");

describe("bloom harness", () => {
    it("writes the dedicated key and reports configured", () => {
        expect(configureBloom(ctx, "sk_test_key")).toMatchObject({
            harness: "bloom",
            configured: true,
        });
        expect(read(envFile())).toBe(
            'POLLINATIONS_API_KEY="sk_test_key"\n',
        );
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
        expect(bloom.status(ctx).configured).toBe(true);
    });

    it("preserves unrelated environment values", () => {
        mkdirSync(join(home, ".bloom"), { recursive: true });
        writeFileSync(envFile(), "OTHER_KEY=keep\n");
        configureBloom(ctx, "sk_test_key");
        expect(read(envFile())).toContain("OTHER_KEY=keep");
    });

    it("restores the original file on off", () => {
        mkdirSync(join(home, ".bloom"), { recursive: true });
        const original = "OTHER_KEY=keep\n";
        writeFileSync(envFile(), original);
        configureBloom(ctx, "sk_test_key");
        expect(disableBloom(ctx).outcome).toBe("restored");
        expect(read(envFile())).toBe(original);
    });

    it("removes only its key when the file changed after on", () => {
        configureBloom(ctx, "sk_test_key");
        writeFileSync(envFile(), `${read(envFile())}LATER=keep\n`);
        expect(disableBloom(ctx).outcome).toBe("stripped");
        expect(read(envFile())).toBe("LATER=keep\n");
    });

    it("honors BLOOM_HOME", () => {
        const custom = join(home, "custom-bloom");
        const customCtx = { home, env: { BLOOM_HOME: custom } };
        configureBloom(customCtx, "sk_test_key");
        expect(bloomHome(customCtx)).toBe(custom);
        expect(existsSync(join(custom, ".env"))).toBe(true);
        expect(existsSync(envFile())).toBe(false);
    });

    it("stops before configuration when Bloom is unavailable", async () => {
        await expect(bloom.on(ctx, {})).rejects.toThrow("Bloom was not found");
        expect(existsSync(envFile())).toBe(false);
    });
});
