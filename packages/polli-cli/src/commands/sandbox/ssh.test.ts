import { spawnSync } from "node:child_process";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:os")>()),
    homedir: vi.fn(),
}));
vi.mock("../../lib/output.js", () => ({ printInfo: vi.fn() }));

const sshAvailable = spawnSync("ssh", ["-V"]).status === 0;
let temp: string;

afterEach(() => {
    if (temp) rmSync(temp, { recursive: true, force: true });
    vi.resetModules();
});

describe.skipIf(!sshAvailable)("sandbox SSH configuration", () => {
    it.each([
        "home-control",
        "home with spaces",
    ])("keeps file paths intact for %s", async (name) => {
        temp = mkdtempSync(join(tmpdir(), "polli-ssh-"));
        const home = join(temp, name);
        const sshDir = join(home, ".pollinations", "ssh");
        mkdirSync(sshDir, { recursive: true });
        // An existing dummy file avoids generating or reading real keys.
        writeFileSync(join(sshDir, "id_ed25519"), "");
        vi.mocked(homedir).mockReturnValue(home);
        const { setupSsh } = await import("./ssh.js");
        setupSsh();

        const config = join(sshDir, "config");
        // ssh -G prints multiple known-host files without delimiters, so
        // also check that the config supplies one quoted path argument.
        expect(readFileSync(config, "utf8")).toContain(
            `UserKnownHostsFile "${join(sshDir, "known_hosts")}"`,
        );
        const parsed = spawnSync("ssh", ["-G", "-F", config, "test.polli"], {
            encoding: "utf8",
        });
        expect(parsed.status, parsed.stderr).toBe(0);
        expect(parsed.stdout.split("\n")).toContain(
            `identityfile ${join(sshDir, "id_ed25519")}`,
        );
        expect(parsed.stdout.split("\n")).toContain(
            `userknownhostsfile ${join(sshDir, "known_hosts")}`,
        );

        // Resolve Include to the fixture home; OpenSSH uses the OS user's
        // home for ~, rather than the mocked Node homedir.
        const userConfig = join(home, ".ssh", "config");
        writeFileSync(
            userConfig,
            readFileSync(userConfig, "utf8").replace(
                "~/.pollinations/ssh/config",
                `"${config}"`,
            ),
        );
        const unrelated = spawnSync(
            "ssh",
            ["-G", "-F", userConfig, "unrelated.example"],
            { encoding: "utf8" },
        );
        expect(unrelated.status, unrelated.stderr).toBe(0);
    });
});
