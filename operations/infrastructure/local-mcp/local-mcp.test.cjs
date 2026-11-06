const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} = require("node:fs");
const { BlockList } = require("node:net");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const sha = "0123456789abcdef0123456789abcdef01234567";
// Public synthetic fixtures; no operational credential is used.
// Assembled so secret scanners do not mistake the fixture for a key.
const privateKey = ["BEGIN", "END"]
    .map((edge) => `-----${edge} OPENSSH PRIVATE KEY-----`)
    .join("\npublic-test-fixture\n");
const publicKey =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPublicSyntheticTestFixtureOnly00000000 local-mcp-pilot-test";

function run(script, args, env) {
    return spawnSync("bash", [join(__dirname, script), ...args], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, ...env },
    });
}

function tempFile(t, name, content) {
    const dir = mkdtempSync(join(tmpdir(), "local-mcp-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, name);
    writeFileSync(file, content);
    return file;
}

// As root on the pilot host an accepted command would really run.
const asRoot = process.getuid?.() === 0;

test("host wrapper accepts only the fixed pilot commands", {
    skip: asRoot,
}, () => {
    for (const command of ["status", "stop", "rollback", `deploy ${sha}`]) {
        const { status, stderr } = run("local-mcp-pilot", [], {
            SSH_ORIGINAL_COMMAND: command,
        });
        assert.notEqual(status, 0);
        assert.match(stderr, /must run as root/, command);
    }
    for (const command of [
        undefined,
        "",
        "bash",
        "sh -c id",
        "status; id",
        "status\nid",
        " status",
        "status ",
        "deploy",
        `deploy ${sha.slice(1)}`,
        `deploy ${sha.toUpperCase()}`,
        `deploy ${sha} --force`,
        `deploy ${sha};id`,
        `deploy  ${sha}`,
        "docker ps",
        "scp -t /tmp",
        "internal-sftp",
    ]) {
        const env =
            command === undefined ? {} : { SSH_ORIGINAL_COMMAND: command };
        const { status, stderr } = run("local-mcp-pilot", [], env);
        assert.notEqual(status, 0);
        assert.match(stderr, /rejected command/, JSON.stringify(command));
    }
});

const [W, X, Y] = ["a", "b", "c"].map((c) => c.repeat(40));

// Runs the wrapper's own switch, restore and stop logic with only the host
// effects replaced: compose "starts" a release, preflight.py fails where
// the scenario says, docker lists and removes what was started (its Nth
// and later listings fail with psFailsFrom), and curl reports the public URL
// as up or down. controllerGone records a current release with nothing running.
function pilot(
    t,
    {
        current,
        previous,
        failing = [],
        publicUp = false,
        psFailsFrom = "",
        controllerGone = false,
    },
    call,
) {
    const root = mkdtempSync(join(tmpdir(), "local-mcp-pilot-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const sha of [W, X, Y])
        mkdirSync(join(root, "releases", sha), { recursive: true });
    if (current) {
        writeFileSync(join(root, "current"), `${current}\n`);
        if (!controllerGone) writeFileSync(join(root, "running"), current);
    }
    if (previous) writeFileSync(join(root, "previous"), `${previous}\n`);
    const script = `
        source "$WRAPPER"
        ROOT=$TEST_ROOT
        load_secrets() { :; }
        check_compose() { :; }
        expect_container() { :; }
        sleep() { :; }
        compose() { printf %s "$1" >"$ROOT/running"; }
        docker() {
            case $1 in
            ps)
                echo >>"$ROOT/listings"
                (($(wc -l <"$ROOT/listings") < \${PS_FAILS_FROM:-999})) || return 1
                cat "$ROOT/running" 2>/dev/null || true
                ;;
            rm) rm -f "$ROOT/running" ;;
            esac
        }
        python3() {
            local release=\${1#"$ROOT/releases/"} where=loopback
            release=\${release%%/*}
            [[ $3 == "$PUBLIC" ]] && where=public
            echo "$release $where" >>"$ROOT/checks"
            [[ " $FAILING " != *" $release:$where "* ]]
        }
        curl() { if [[ -n $PUBLIC_UP ]]; then echo 200; else echo 530; fi; }
        ${call}`;
    const result = spawnSync("bash", ["-c", script], {
        encoding: "utf8",
        env: {
            PATH: process.env.PATH,
            WRAPPER: join(__dirname, "local-mcp-pilot"),
            TEST_ROOT: root,
            FAILING: failing.join(" "),
            PUBLIC_UP: publicUp ? "1" : "",
            PS_FAILS_FROM: String(psFailsFrom),
        },
    });
    const read = (name) => {
        const path = join(root, name);
        return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
    };
    return {
        ...result,
        current: read("current"),
        previous: read("previous"),
        running: read("running"),
        checks: read("checks")?.split("\n") ?? [],
    };
}

test("a live switch needs both the loopback and public checks", (t) => {
    const ok = pilot(
        t,
        { current: X, previous: W },
        `switch_release ${Y} deploy`,
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /live, loopback and public checks passed/);
    assert.deepEqual([ok.current, ok.previous, ok.running], [Y, X, Y]);
    assert.deepEqual(ok.checks, [`${Y} loopback`, `${Y} public`]);
});

test("a failed public check on first activation leaves the pilot stopped", (t) => {
    const first = pilot(
        t,
        { failing: [`${Y}:public`] },
        `switch_release ${Y} deploy`,
    );
    assert.notEqual(first.status, 0);
    assert.match(first.stderr, new RegExp(`deploy ${Y} failed; pilot stopped`));
    assert.match(first.stdout, /no longer answers \(status 530\)/);
    assert.deepEqual(
        [first.current, first.previous, first.running],
        [undefined, undefined, undefined],
    );
    // Retried while the tunnel reconnects, then given up.
    assert.equal(first.checks.filter((c) => c === `${Y} public`).length, 6);
});

test("a failed public check restores the release that was live", (t) => {
    const restored = pilot(
        t,
        { current: X, previous: W, failing: [`${Y}:public`] },
        `switch_release ${Y} deploy`,
    );
    assert.notEqual(restored.status, 0);
    assert.match(
        restored.stderr,
        new RegExp(
            `deploy ${Y} failed; restored ${X}, loopback and public checks passed`,
        ),
    );
    assert.deepEqual(
        [restored.current, restored.previous, restored.running],
        [X, W, X],
    );
    assert.deepEqual(restored.checks.slice(-2), [
        `${X} loopback`,
        `${X} public`,
    ]);
});

test("a restore that cannot be proved leaves the pilot stopped", (t) => {
    const stopped = pilot(
        t,
        { current: X, previous: W, failing: [`${Y}:public`, `${X}:public`] },
        `switch_release ${Y} deploy`,
    );
    assert.notEqual(stopped.status, 0);
    assert.match(
        stopped.stderr,
        new RegExp(`deploy ${Y} failed; pilot stopped`),
    );
    assert.deepEqual(
        [stopped.current, stopped.previous, stopped.running],
        [undefined, X, undefined],
    );
});

test("rollback uses the same switch and refuses without a previous release", (t) => {
    const back = pilot(t, { current: Y, previous: X }, "rollback");
    assert.equal(back.status, 0, back.stderr);
    assert.deepEqual([back.current, back.previous, back.running], [X, Y, X]);
    const kept = pilot(
        t,
        { current: Y, previous: X, failing: [`${X}:public`] },
        "rollback",
    );
    assert.match(
        kept.stderr,
        new RegExp(`rollback ${X} failed; restored ${Y}`),
    );
    assert.deepEqual([kept.current, kept.previous, kept.running], [Y, X, Y]);
    const none = pilot(t, { current: Y }, "rollback");
    assert.match(none.stderr, /no previous release to roll back to/);
    assert.deepEqual([none.current, none.running], [Y, Y]);
});

test("stop must see the public URL go down", (t) => {
    const stopped = pilot(t, { current: Y, previous: X }, "halt");
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.deepEqual(
        [stopped.current, stopped.previous, stopped.running],
        [undefined, Y, undefined],
    );
    const answering = pilot(t, { current: Y, publicUp: true }, "halt");
    assert.notEqual(answering.status, 0);
    assert.match(answering.stderr, /still answers; another tunnel connector/);
    assert.equal(answering.running, undefined);
});

test("stop fails without claiming containment if docker cannot list containers", (t) => {
    // Before stopping anything, and when re-checking after docker rm.
    for (const psFailsFrom of [1, 2]) {
        const blind = pilot(
            t,
            { current: Y, previous: X, psFailsFrom },
            "halt",
        );
        assert.notEqual(blind.status, 0);
        assert.match(
            blind.stderr,
            /could not list pilot containers.*stop not proved/,
        );
        assert.doesNotMatch(blind.stdout, /stopped|no longer answers/);
        assert.deepEqual([blind.current, blind.previous], [Y, X]);
    }
});

test("status fails only when the recorded release has no controller", (t) => {
    const stopped = pilot(t, { previous: Y }, "status");
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.match(stopped.stdout, /current=none/);
    const gone = pilot(t, { current: Y, controllerGone: true }, "status");
    assert.notEqual(gone.status, 0);
    assert.match(
        gone.stderr,
        new RegExp(`current release ${Y} has no running controller`),
    );
    assert.deepEqual(gone.checks, []);
    const live = pilot(t, { current: Y }, "status");
    assert.equal(live.status, 0, live.stderr);
    assert.deepEqual(live.checks, [`${Y} loopback`, `${Y} public`]);
});

test("the verify fixture network cannot overlap the pilot network", () => {
    const source = (file) => readFileSync(join(__dirname, file), "utf8");
    const blocks = [
        source("compose.yaml").match(/LOCAL_MCP_SUBNET:-([\d.]+)\/(\d+)/),
        source("verify.sh").match(/LOCAL_MCP_SUBNET=([\d.]+)\/(\d+)/),
    ].map(([, address, prefix]) => {
        const list = new BlockList();
        list.addSubnet(address, Number(prefix));
        return { address, list };
    });
    // CIDR blocks either nest or are disjoint.
    const [pilotNet, fixtureNet] = blocks;
    assert.equal(pilotNet.list.check(fixtureNet.address), false);
    assert.equal(fixtureNet.list.check(pilotNet.address), false);
});

test("CI client fails closed before connecting", () => {
    const production = { GITHUB_REF: "refs/heads/production", GITHUB_SHA: sha };
    const withKey = {
        ...production,
        LOCAL_MCP_PILOT_DEPLOY_SSH_KEY: privateKey,
    };
    for (const [env, operation, message] of [
        [
            { ...withKey, GITHUB_REF: "refs/heads/main" },
            "deploy",
            /only from the production branch/,
        ],
        [
            { ...withKey, GITHUB_REF: "refs/pull/1/merge" },
            "status",
            /only from the production branch/,
        ],
        [
            { ...withKey, GITHUB_REF: undefined },
            "stop",
            /only from the production branch/,
        ],
        [withKey, "shell", /unknown operation/],
        [withKey, "", /unknown operation/],
        [withKey, "status extra", /unknown operation/],
        [
            { ...withKey, GITHUB_SHA: "abc123" },
            "deploy",
            /full production commit SHA/,
        ],
        [production, "status", /LOCAL_MCP_PILOT_DEPLOY_SSH_KEY is not set/],
        [
            { ...production, LOCAL_MCP_PILOT_DEPLOY_SSH_KEY: "" },
            "deploy",
            /is not set/,
        ],
    ]) {
        const definedEnv = Object.fromEntries(
            Object.entries(env).filter(([, value]) => value !== undefined),
        );
        const { status, stderr } = run("ci-remote.sh", [operation], definedEnv);
        assert.notEqual(status, 0);
        assert.match(stderr, message, `${operation} ${env.GITHUB_REF}`);
    }
});

test("bootstrap renders a restricted forced-command authorization", (t) => {
    const { status, stdout, stderr } = run("bootstrap-host.sh", [
        "--print",
        tempFile(t, "deploy.pub", `${publicKey}\n`),
    ]);
    assert.equal(status, 0, stderr);
    const lines = stdout.split("\n");
    assert.equal(
        lines[1],
        `restrict,command="/usr/bin/sudo -n /usr/local/sbin/local-mcp-pilot" ${publicKey}`,
    );
    const sudoers = lines.slice(4, 6).join("\n");
    assert.equal(
        sudoers,
        'Defaults!/usr/local/sbin/local-mcp-pilot env_keep += "SSH_ORIGINAL_COMMAND"\n' +
            'local-mcp-deploy ALL=(root) NOPASSWD: /usr/local/sbin/local-mcp-pilot ""',
    );
    const visudo = spawnSync(
        "visudo",
        ["-cf", tempFile(t, "sudoers", `${sudoers}\n`)],
        {
            encoding: "utf8",
        },
    );
    if (visudo.error?.code !== "ENOENT") {
        assert.equal(visudo.status, 0, visudo.stderr || visudo.stdout);
    }
});

test("bootstrap rejects anything but one ed25519 public key", (t) => {
    for (const content of [
        privateKey,
        publicKey.replace("ssh-ed25519", "ssh-rsa"),
        `${publicKey}\n${publicKey}`,
        `command="/bin/sh" ${publicKey}`,
        "",
    ]) {
        const { status, stderr } = run("bootstrap-host.sh", [
            "--print",
            tempFile(t, "deploy.pub", content),
        ]);
        assert.notEqual(status, 0);
        assert.match(stderr, /exactly one ssh-ed25519 public key line/);
    }
});
