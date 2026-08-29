/**
 * Storage primitive contract for the general Git-storage MCP (#13790).
 *
 * The contract is intentionally storage-agnostic: a repository is a versioned,
 * Git-compatible bag of files scoped by (caller, agent, repo). Memory is ONE
 * use case and is NOT baked into the storage API — callers opt in by reading /
 * writing a `MEMORY.md` (or any structured file) through the same tools.
 *
 * A store instance is constructed per request from the resolved caller identity
 * and the agent id; it never receives a long-lived repository token. The token
 * (Cloudflare Artifacts binding or a connected GitHub App installation token)
 * lives only in the Worker env / upstream proxy, never in the model context.
 */

import { ArtifactsStore } from "./artifactsStore.js";
import { GitHubStore } from "./githubStore.js";

/**
 * @typedef {Object} RepoRef
 * @property {string} caller  resolved owner of the caller (from auth token)
 * @property {string} agent   agent namespace (from x-agent-id header)
 * @property {string} repo    repository name within the (caller, agent) scope
 */

/**
 * Normalize and validate the (caller, agent, repo) triple. Throws on invalid
 * segments so a bad name can never escape the scope boundary.
 * @param {string} caller
 * @param {string} agent
 * @param {string} repo
 * @returns {RepoRef}
 */
export function normalizeRepoRef(caller, agent, repo) {
    const seg = (s) =>
        String(s ?? "")
            .trim()
            .toLowerCase();
    const safe = /^[a-z0-9][a-z0-9._-]{0,63}$/;
    const c = seg(caller);
    const a = seg(agent) || "default";
    const r = seg(repo);
    if (!safe.test(c) || !safe.test(a) || !safe.test(r)) {
        throw new StorageContractError(
            "invalid repo ref: caller/agent/repo must match [a-z0-9][a-z0-9._-]{0,63}",
        );
    }
    return { caller: c, agent: a, repo: r };
}

/**
 * Resolve the in-scope repository path used by the underlying backend.
 * Layout keeps one namespace per (caller, agent) so cross-agent and cross-caller
 * access is structurally impossible.
 * @param {RepoRef} ref
 * @returns {string}
 */
export function scopedPath(ref) {
    return `${ref.caller}/${ref.agent}/${ref.repo}`;
}

/**
 * Common interface every backend implements. The MCP layer depends only on this,
 * so an Artifacts-owned repository and a connected GitHub repository are swappable.
 *
 *   listRepos()                -> string[]   (repo names in this caller/agent scope)
 *   readFile(path)             -> { content, sha? }
 *   writeCommit({ message, files: [{path, content}] }) -> { sha, paths }
 *   history({ limit })         -> { sha, message, at }[]
 *   fork({ into, source })     -> { repo }             (copy repo within scope)
 */
export class StorageContractError extends Error {
    /** @param {string} message */ constructor(message) {
        super(message);
        this.name = "StorageContractError";
    }
}

/**
 * Build a store for the requested backend. Backends share the tool contract;
 * the only difference is where bytes live and which short-lived credential the
 * Worker uses (binding vs installation token) — neither is visible to the model.
 *
 * @param {"artifacts"|"github"} backend
 * @param {object} ctx  { ref, env, githubToken? }
 * @returns {import("./artifactsStore.js").ArtifactsStore|import("./githubStore.js").GitHubStore}
 */
export function createStore(backend, ctx) {
    if (backend === "artifacts") {
        return new ArtifactsStore(ctx);
    }
    if (backend === "github") {
        return new GitHubStore(ctx);
    }
    throw new StorageContractError(`unknown backend: ${backend}`);
}

/**
 * Memory convention helper — deliberately NOT part of the storage API.
 * Agents may call these to keep a `MEMORY.md`, but the store treats it as any
 * other file. Returns the canonical memory filename.
 */
export const MEMORY_FILE = "MEMORY.md";

/**
 * Read the agent's memory document if present, else null. Memory is just a file.
 * @param {import("./artifactsStore.js").ArtifactsStore|import("./githubStore.js").GitHubStore} store
 * @returns {Promise<string|null>}
 */
export async function readMemory(store) {
    try {
        const { content } = await store.readFile(MEMORY_FILE);
        return content;
    } catch {
        return null;
    }
}

/**
 * Append or replace the memory document. Memory is just a file.
 * @param {import("./artifactsStore.js").ArtifactsStore|import("./githubStore.js").GitHubStore} store
 * @param {string} content
 * @returns {Promise<{sha:string}>}
 */
export async function writeMemory(store, content) {
    const res = await store.writeCommit({
        message: "chore: update MEMORY.md",
        files: [{ path: MEMORY_FILE, content }],
    });
    return { sha: res.sha };
}
