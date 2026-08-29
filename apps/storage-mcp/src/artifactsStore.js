import { StorageContractError, scopedPath } from "./store.js";

/**
 * Cloudflare Artifacts backend.
 *
 * The Worker holds the Artifacts binding (or a Workers-binding REST commit API)
 * in `env`. The model NEVER sees a repository token: tool calls carry only the
 * resolved (caller, agent, repo) scope, and this class translates them to the
 * Artifacts repository lifecycle + read/history/fork using the binding.
 *
 * Public Artifacts docs describe: repository lifecycle, read/history, fork, and
 * token APIs. Writes may use a direct binding/REST commit API; we prototype the
 * Git-Smart-HTTP-compatible shape (commit = { message, files }) and keep the
 * binding as the only credential.
 */
export class ArtifactsStore {
    /**
     * @param {object} ctx { ref: {caller,agent,repo}, env: Record<string, any> }
     */
    constructor(ctx) {
        this.ref = ctx.ref;
        this.env = ctx.env ?? {};
        this.binding = this.env.ARTIFACTS ?? null;
        if (!this.binding && !this.env.ARTIFACTS_API_URL) {
            throw new StorageContractError(
                "Artifacts backend requires an ARTIFACTS binding or ARTIFACTS_API_URL",
            );
        }
    }

    /** Internal: absolute repo identifier for this backend. */
    repoId() {
        return `artifacts:${scopedPath(this.ref)}`;
    }

    /** @returns {string[]} */
    async listRepos() {
        // Listing is scoped to (caller, agent); the binding resolves the namespace.
        const listing = await this.#call(
            "GET",
            `/repos/${this.ref.caller}/${this.ref.agent}`,
        );
        return Array.isArray(listing?.repos)
            ? listing.repos.map((r) => r.name)
            : [];
    }

    /**
     * @param {string} path
     * @returns {Promise<{content:string, sha?:string}>}
     */
    async readFile(path) {
        const res = await this.#call(
            "GET",
            `/repos/${scopedPath(this.ref)}/files/${encodeURIComponent(path)}`,
        );
        if (!res || res.content == null) {
            throw new StorageContractError(`file not found: ${path}`);
        }
        return { content: res.content, sha: res.sha };
    }

    /**
     * @param {{message:string, files: {path:string, content:string}[]}} commit
     * @returns {Promise<{sha:string, paths:string[]}>}
     */
    async writeCommit({ message, files }) {
        if (!Array.isArray(files) || files.length === 0) {
            throw new StorageContractError(
                "writeCommit requires at least one file",
            );
        }
        const res = await this.#call(
            "POST",
            `/repos/${scopedPath(this.ref)}/commits`,
            {
                message,
                files: files.map((f) => ({ path: f.path, content: f.content })),
            },
        );
        return { sha: res?.sha ?? "unknown", paths: files.map((f) => f.path) };
    }

    /**
     * @param {{limit?:number}} opts
     * @returns {Promise<{sha:string, message:string, at:string}[]>}
     */
    async history({ limit = 20 } = {}) {
        const res = await this.#call(
            "GET",
            `/repos/${scopedPath(this.ref)}/history?limit=${limit}`,
        );
        return Array.isArray(res?.commits) ? res.commits : [];
    }

    /**
     * Fork a source repo into a new repo within the SAME (caller, agent) scope.
     * @param {{into:string, source:string}} opts
     * @returns {Promise<{repo:string}>}
     */
    async fork({ into, source }) {
        if (!into || !source)
            throw new StorageContractError("fork requires into + source");
        const res = await this.#call(
            "POST",
            `/repos/${this.ref.caller}/${this.ref.agent}/${encodeURIComponent(source)}/fork`,
            {
                into,
            },
        );
        return { repo: res?.repo ?? into };
    }

    /** Thin wrapper over the Artifacts binding / REST commit API. */
    async #call(method, path, body) {
        if (this.binding?.fetch) {
            const url = `artifact:${path}`;
            const init = { method, headers: {} };
            if (body !== undefined) init.body = JSON.stringify(body);
            const r = await this.binding.fetch(url, init);
            if (!r.ok)
                throw new StorageContractError(
                    `artifacts ${method} ${path} -> ${r.status}`,
                );
            return r.status === 204 ? null : await r.json().catch(() => null);
        }
        const base = this.env.ARTIFACTS_API_URL;
        const r = await fetch(`${base}${path}`, {
            method,
            headers: { "content-type": "application/json" },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!r.ok)
            throw new StorageContractError(
                `artifacts ${method} ${path} -> ${r.status}`,
            );
        return r.status === 204 ? null : await r.json().catch(() => null);
    }
}
