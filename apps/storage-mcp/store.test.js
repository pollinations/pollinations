import assert from "node:assert/strict";
import test from "node:test";
import {
    createStore,
    MEMORY_FILE,
    normalizeRepoRef,
    readMemory,
    StorageContractError,
    scopedPath,
    writeMemory,
} from "./src/store.js";

/**
 * In-memory fake of the Artifacts backend contract so we can prove the storage
 * primitive (list/read/write-commit/history/fork, scoping, memory convention)
 * without a live Cloudflare credential. The real ArtifactsStore talks to the
 * binding via the same call shape.
 */
class FakeArtifacts {
    constructor() {
        this.repos = new Map(); // scopedPath -> { files: {path: {content, sha}}, commits: [] }
    }
    async fetch(url, init) {
        const u = new URL(url.replace("artifact:", "https://artifact/"));
        const parts = u.pathname.split("/").filter(Boolean);
        // /repos/:caller/:agent                -> list
        // /repos/:caller/:agent/:repo/files/:p -> read
        // /repos/:caller/:agent/:repo/commits  -> commit
        // /repos/:caller/:agent/:repo/history  -> history
        // /repos/:caller/:agent/:src/fork       -> fork
        const body = init.body ? JSON.parse(init.body) : undefined;
        if (parts[1] === "repos" && parts.length === 3) {
            const prefix = `${parts[1]}/${parts[2]}`;
            return json(200, {
                repos: [...this.repos.keys()]
                    .filter((k) => k.startsWith(`${prefix}/`))
                    .map((k) => ({ name: k.split("/")[2] })),
            });
        }
        const scope = `${parts[1]}/${parts[2]}/${parts[3]}`;
        const repo = this.repos.get(scope) ?? { files: {}, commits: [] };
        this.repos.set(scope, repo);
        if (parts[4] === "files") {
            const f = repo.files[decodeURIComponent(parts[5])];
            if (!f) return json(404, { error: "not found" });
            return json(200, f);
        }
        if (parts[4] === "commits") {
            const sha = `sha-${repo.commits.length + 1}`;
            for (const file of body.files)
                repo.files[file.path] = { content: file.content, sha };
            repo.commits.push({ sha, message: body.message });
            return json(200, { sha, paths: body.files.map((f) => f.path) });
        }
        if (parts[4] === "history") {
            return json(200, { commits: repo.commits });
        }
        if (parts[4] === "fork") {
            const dest = `${parts[1]}/${parts[2]}/${body.into}`;
            this.repos.set(dest, structuredClone(repo));
            return json(200, { repo: body.into });
        }
        return json(404, { error: "no route" });
    }
}

function json(status, obj) {
    return { ok: status < 400, status, json: async () => obj };
}

function ctxFor(_fake, caller = "alice", agent = "agent1", repo = "notes") {
    return {
        ref: normalizeRepoRef(caller, agent, repo),
        env: { ARTIFACTS: new FakeArtifacts() },
    };
}

test("normalizeRepoRef enforces safe segments and defaults agent", () => {
    assert.deepEqual(normalizeRepoRef("Alice", "", "Notes"), {
        caller: "alice",
        agent: "default",
        repo: "notes",
    });
    assert.throws(
        () => normalizeRepoRef("../bob", "a", "r"),
        StorageContractError,
    );
});

test("scopedPath isolates caller and agent", () => {
    assert.equal(
        scopedPath(normalizeRepoRef("alice", "agent1", "notes")),
        "alice/agent1/notes",
    );
});

test("Artifacts store: write_commit then read_file round-trips", async () => {
    const store = createStore("artifacts", ctxFor(new FakeArtifacts()));
    const c = await store.writeCommit({
        message: "init",
        files: [{ path: "a.txt", content: "hi" }],
    });
    assert.match(c.sha, /^sha-/);
    const f = await store.readFile("a.txt");
    assert.equal(f.content, "hi");
});

test("history records commits in order", async () => {
    const store = createStore("artifacts", ctxFor(new FakeArtifacts()));
    await store.writeCommit({
        message: "m1",
        files: [{ path: "a", content: "1" }],
    });
    await store.writeCommit({
        message: "m2",
        files: [{ path: "a", content: "2" }],
    });
    const h = await store.history({ limit: 10 });
    assert.equal(h.length, 2);
    assert.equal(h[1].message, "m2");
});

test("fork copies repo within the same scope", async () => {
    const env = { ARTIFACTS: new FakeArtifacts() };
    const src = createStore("artifacts", {
        ref: normalizeRepoRef("alice", "agent1", "notes"),
        env,
    });
    await src.writeCommit({
        message: "init",
        files: [{ path: "a", content: "x" }],
    });
    const r = await src.fork({ into: "notes-copy", source: "notes" });
    assert.equal(r.repo, "notes-copy");
    const copy = createStore("artifacts", {
        ref: normalizeRepoRef("alice", "agent1", "notes-copy"),
        env,
    });
    assert.equal((await copy.readFile("a")).content, "x");
});

test("memory convention is just a file (not baked into storage API)", async () => {
    const store = createStore("artifacts", ctxFor(new FakeArtifacts()));
    assert.equal(await readMemory(store), null);
    await writeMemory(store, "# Memory\n- did thing");
    assert.equal(await readMemory(store), "# Memory\n- did thing");
    assert.equal(MEMORY_FILE, "MEMORY.md");
});

test("cross-agent access is structurally impossible (scope boundary)", async () => {
    const env = { ARTIFACTS: new FakeArtifacts() };
    const a1 = createStore("artifacts", {
        ref: normalizeRepoRef("alice", "agent1", "secret"),
        env,
    });
    await a1.writeCommit({
        message: "x",
        files: [{ path: "k", content: "v" }],
    });
    const a2 = createStore("artifacts", {
        ref: normalizeRepoRef("alice", "agent2", "secret"),
        env,
    });
    await assert.rejects(() => a2.readFile("k"), StorageContractError);
});

test("unknown backend throws", () => {
    assert.throws(
        () => createStore("s3", ctxFor(new FakeArtifacts())),
        StorageContractError,
    );
});
