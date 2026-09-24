import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CcrConfig, claudeCode, claudeCodeDeps } from "./claude-code.js";
import type { HarnessContext } from "./types.js";

const MODELS = [
    { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
];

const PROVIDER = {
    id: "prov-1",
    name: "pollinations",
    api_base_url: "https://gen.pollinations.ai/v1",
    api_key: "sk_child_key",
};
const PROFILE = {
    id: "prof-1",
    agent: "claude-code",
    name: "Claude Code",
    providerId: "prov-1",
    model: "openai/gpt-5.4-nano",
    enabled: true,
};

const emptyConfig: CcrConfig = { providers: [], profiles: [] };
const providerOnly: CcrConfig = { providers: [PROVIDER], profiles: [] };
const fullConfig: CcrConfig = {
    providers: [PROVIDER],
    profiles: [PROFILE],
};

let home: string;
let ctx: HarnessContext;
let revokeSpy: ReturnType<typeof vi.fn>;

const contextPath = () =>
    join(home, ".pollinations", "harnesses", "claude-code", "context.json");
const readContext = () =>
    JSON.parse(readFileSync(contextPath(), "utf-8")) as Record<string, unknown>;

const installFakeBinaries = (claudeVersion = "2.1.40 (Claude Code)") => {
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    const claude = join(binDir, "claude");
    writeFileSync(
        claude,
        `#!/usr/bin/env node\nif (process.argv[2] === "--version") { console.log(${JSON.stringify(claudeVersion)}); process.exit(0); }\nprocess.exit(1);\n`,
    );
    const ccr = join(binDir, "ccr");
    writeFileSync(
        ccr,
        '#!/usr/bin/env node\nif (process.argv[2] === "--version") { console.log("3.1.1"); process.exit(0); }\nif (process.argv[2] === "start") process.exit(0);\nprocess.exit(1);\n',
    );
    chmodSync(claude, 0o755);
    chmodSync(ccr, 0o755);
    return binDir;
};

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-ccr-"));
    const binDir = installFakeBinaries();
    ctx = {
        home,
        env: {
            ...process.env,
            HOME: home,
            PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        },
    };
    revokeSpy = vi.fn().mockResolvedValue(1);
    claudeCodeDeps.fetchModels = vi.fn().mockResolvedValue(MODELS);
    claudeCodeDeps.resolveKey = vi.fn().mockResolvedValue("sk_child_key");
    claudeCodeDeps.revokeKeys = revokeSpy;
    claudeCodeDeps.validateKey = vi.fn().mockResolvedValue(true);
    claudeCodeDeps.readConfig = () => emptyConfig;
    claudeCodeDeps.openUrl = vi.fn();
    claudeCodeDeps.isInteractive = () => false;
    claudeCodeDeps.sleep = vi.fn().mockResolvedValue(undefined);
    claudeCodeDeps.ping = vi.fn().mockResolvedValue(true);
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
});

/** First run starts empty; the provider appears (in the UI) after it. */
const completeSetup = async () => {
    claudeCodeDeps.isInteractive = () => true;
    const configs = [emptyConfig, emptyConfig, fullConfig];
    claudeCodeDeps.readConfig = () =>
        configs.length > 1 ? (configs.shift() as CcrConfig) : fullConfig;
    const result = await claudeCode.on(ctx, {});
    expect(result.configured).toBe(true);
    claudeCodeDeps.readConfig = () => fullConfig;
};

describe("claude-code harness on", () => {
    it("waits at awaiting-provider when the UI entries do not exist yet", async () => {
        const result = await claudeCode.on(ctx, {});
        expect(result.exitCode).toBe(3);
        expect(result.state).toBe("awaiting-provider");
        expect(result.configured).toBe(false);

        const saved = readContext();
        expect(saved.state).toBe("awaiting-provider");
        expect(saved.pre_provider_ids).toEqual([]);
        expect(claudeCodeDeps.openUrl).toHaveBeenCalledWith(
            "http://127.0.0.1:3458",
        );
        expect(claudeCodeDeps.resolveKey).toHaveBeenCalled();
    });

    it("verifies once the user completes the UI steps", async () => {
        claudeCodeDeps.isInteractive = () => true;
        const configs = [emptyConfig, providerOnly, fullConfig];
        claudeCodeDeps.readConfig = () =>
            configs.length > 1 ? (configs.shift() as CcrConfig) : fullConfig;

        const result = await claudeCode.on(ctx, {});
        expect(result.exitCode ?? 0).toBe(0);
        expect(result.configured).toBe(true);
        expect(result.model).toBe("openai/gpt-5.4-nano");

        const saved = readContext();
        expect(saved.state).toBe("verified");
        expect(saved.provider_id).toBe("prov-1");
        expect(saved.profile_id).toBe("prof-1");
    });

    it("is idempotent when already verified", async () => {
        await completeSetup();
        const calls = (claudeCodeDeps.resolveKey as ReturnType<typeof vi.fn>)
            .mock.calls.length;
        const again = await claudeCode.on(ctx, {});
        expect(again.notes).toContain("Already verified; nothing to do.");
        // No new key was minted on the repeat run.
        expect(
            (claudeCodeDeps.resolveKey as ReturnType<typeof vi.fn>).mock.calls
                .length,
        ).toBe(calls);
    });

    it("never treats a pre-existing provider as ours", async () => {
        // A provider that existed BEFORE our first intent: captured in
        // pre_provider_ids, so it must not satisfy ownership.
        claudeCodeDeps.readConfig = () => fullConfig;
        const first = await claudeCode.on(ctx, {});
        expect(first.state).not.toBe("verified");
        expect(readContext().provider_id).toBeUndefined();
    });

    it("refuses an unsupported Claude Code major version", async () => {
        const binDir = installFakeBinaries("3.0.1 (Claude Code)");
        void binDir;
        await expect(claudeCode.on(ctx, {})).rejects.toMatchObject({
            exitCode: 2,
        });
        expect(existsSync(contextPath())).toBe(false);
    });
});

describe("claude-code harness off", () => {
    it("stays manual-pending while the UI entries still exist", async () => {
        await completeSetup();

        const result = await claudeCode.off(ctx);
        expect(result.exitCode).toBe(3);
        expect(result.state).toBe("manual-pending");
        expect(result.outcome).toBe("unchanged");
        expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("revokes the key and clears state once the entries are gone", async () => {
        await completeSetup();

        claudeCodeDeps.readConfig = () => emptyConfig;
        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("stripped");
        expect(result.exitCode ?? 0).toBe(0);
        expect(revokeSpy).toHaveBeenCalledWith("claude-code");
        expect(existsSync(contextPath())).toBe(false);
    });

    it("reports unchanged when nothing was configured", async () => {
        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("unchanged");
        expect(result.exitCode).toBe(4);
    });
});

describe("claude-code harness status", () => {
    it("reports not-configured with exit 4 on a fresh machine", async () => {
        const result = await claudeCode.status(ctx);
        expect(result.state).toBe("not-configured");
        expect(result.exitCode).toBe(4);
    });

    it("reports awaiting-provider mid-setup without failing", async () => {
        await claudeCode.on(ctx, {});
        const result = await claudeCode.status(ctx);
        expect(result.state).toBe("awaiting-provider");
        expect(result.exitCode).toBe(0);
    });

    it("reports key-valid when verified and the key validates", async () => {
        await completeSetup();
        const result = await claudeCode.status(ctx);
        expect(result.state).toBe("key-valid");
        expect(result.configured).toBe(true);
    });

    it("reports key-invalid when the stored key no longer validates", async () => {
        await completeSetup();
        claudeCodeDeps.validateKey = vi.fn().mockResolvedValue(false);
        const result = await claudeCode.status(ctx);
        expect(result.state).toBe("key-invalid");
        expect(result.configured).toBe(false);
    });
});

describe("claude-code harness regression (cross-review)", () => {
    it("re-mints and waits when the verified setup's key stopped validating", async () => {
        await completeSetup();
        claudeCodeDeps.validateKey = vi.fn().mockResolvedValue(false);
        const resolveKey = vi.fn().mockResolvedValue("sk_new_key");
        claudeCodeDeps.resolveKey = resolveKey;

        const waiting = await claudeCode.on(ctx, {});
        // Replace flow: the stale stored key is NOT reused as existingKey.
        expect(resolveKey).toHaveBeenCalledWith(
            expect.objectContaining({ id: "claude-code" }),
            expect.anything(),
        );
        expect(resolveKey.mock.calls[0][0].existingKey).toBeNull();
        expect(waiting.configured).toBe(false);
        expect(waiting.exitCode).toBe(3);

        // User pastes the new key in the UI; the next on verifies.
        claudeCodeDeps.validateKey = vi.fn().mockResolvedValue(true);
        claudeCodeDeps.readConfig = () => ({
            providers: [{ ...PROVIDER, api_key: "sk_new_key" }],
            profiles: [PROFILE],
        });
        const repaired = await claudeCode.on(ctx, {});
        expect(repaired.configured).toBe(true);
    });

    it("off ignores UI entries when there is no polli context", async () => {
        // A provider named "pollinations" exists, but we never ran `on`:
        // without a context journal nothing here is ours to act on.
        claudeCodeDeps.readConfig = () => fullConfig;
        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("unchanged");
        expect(result.exitCode).toBe(4);
        expect(result.state).not.toBe("manual-pending");
    });
});
