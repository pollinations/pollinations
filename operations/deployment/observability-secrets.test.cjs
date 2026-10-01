const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");

test("Observability provisions its session secret and rejects missing configuration", () => {
    const directory = mkdtempSync(
        join(tmpdir(), "observability-secrets-test-"),
    );
    const script = resolve(
        __dirname,
        "../observability/scripts/push-secrets.mjs",
    );
    const input = join(directory, "input.json");
    const secrets = {
        POLLINATIONS_AUTH_SESSION_SECRET: "test-session-only",
        GF_ADMIN_PASSWORD: "test-grafana-only",
        TINYBIRD_READ_TOKEN: "test-read-only",
        TINYBIRD_LEGACY_READ_TOKEN: "test-legacy-only",
        DISCORD_WEBHOOK_URL: "https://example.invalid/webhook",
        CLOUDFLARE_TUNNEL_TOKEN: "test-tunnel-only",
    };

    try {
        writeFileSync(input, JSON.stringify(secrets));
        const result = spawnSync(process.execPath, [script, input, "local"], {
            cwd: directory,
            encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
        const vars = readFileSync(join(directory, ".dev.vars"), "utf8");
        assert.match(
            vars,
            /^POLLINATIONS_AUTH_SESSION_SECRET="test-session-only"$/m,
        );
        assert.doesNotMatch(vars, /CLOUDFLARE_TUNNEL_TOKEN/);

        delete secrets.POLLINATIONS_AUTH_SESSION_SECRET;
        writeFileSync(input, JSON.stringify(secrets));
        const missing = spawnSync(process.execPath, [script, input, "local"], {
            cwd: directory,
            encoding: "utf8",
        });
        assert.equal(missing.status, 1);
        assert.match(
            missing.stderr,
            /Missing required secret POLLINATIONS_AUTH_SESSION_SECRET/,
        );
        assert.equal(readFileSync(join(directory, ".dev.vars"), "utf8"), vars);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
