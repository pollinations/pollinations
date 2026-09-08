import { StorageContractError } from "./store.js";

/**
 * Connected GitHub backend — same tool contract as ArtifactsStore.
 *
 * Proves the issue's requirement: an Artifacts-owned repository and a connected
 * GitHub repository sit behind the identical MCP tool surface. The Worker mints
 * a SHORT-LIVED installation token for the (caller, agent) scope and never
 * forwards it to the model; tool calls only carry the resolved repo scope.
 */
export class GitHubStore {
    /**
     * @param {object} ctx { ref: {caller,agent,repo}, env: Record<string,any>, githubToken?: string }
     */
    constructor(ctx) {
        this.ref = ctx.ref;
        this.env = ctx.env ?? {};
        // Installation token is minted upstream per request; never stored on the model.
        this.token =
            ctx.githubToken ?? this.env.GITHUB_INSTALLATION_TOKEN ?? null;
        this.apiBase = this.env.GITHUB_API_URL ?? "https://api.github.com";
        if (!this.token) {
            throw new StorageContractError(
                "GitHub backend requires a short-lived installation token",
            );
        }
    }

    repoId() {
        // GitHub repos are namespaced under the caller's connected org/owner.
        return `${this.ref.caller}/${this.ref.agent}-${this.ref.repo}`;
    }

    async listRepos() {
        const _owner = this.ref.caller;
        const res = await this.#gh("GET", `/user/repos?affiliation=owner`);
        const prefix = `${this.ref.agent}-`;
        return Array.isArray(res)
            ? res
                  .filter((r) => r.name.startsWith(prefix))
                  .map((r) => r.name.slice(prefix.length))
            : [];
    }

    async readFile(path) {
        const res = await this.#gh(
            "GET",
            `/repos/${this.repoId()}/contents/${encodeURIComponent(path)}`,
        );
        if (!res || !res.content)
            throw new StorageContractError(`file not found: ${path}`);
        const content = Buffer.from(
            res.content,
            res.encoding === "base64" ? "base64" : "utf8",
        ).toString("utf8");
        return { content, sha: res.sha };
    }

    async writeCommit({ message, files }) {
        // Minimal two-step: get the ref, then create/update a tree. Kept small on purpose.
        const base = await this.#gh(
            "GET",
            `/repos/${this.repoId()}/git/ref/heads/main`,
        );
        const baseSha = base?.object?.sha;
        const tree = files.map((f) => ({
            path: f.path,
            mode: "100644",
            type: "blob",
            content: f.content,
        }));
        const newTree = await this.#gh(
            "POST",
            `/repos/${this.repoId()}/git/trees`,
            { base_tree: baseSha, tree },
        );
        const commit = await this.#gh(
            "POST",
            `/repos/${this.repoId()}/git/commits`,
            {
                message,
                tree: newTree.sha,
                parents: baseSha ? [baseSha] : [],
            },
        );
        await this.#gh("PATCH", `/repos/${this.repoId()}/git/refs/heads/main`, {
            sha: commit.sha,
        });
        return { sha: commit.sha, paths: files.map((f) => f.path) };
    }

    async history({ limit = 20 } = {}) {
        const res = await this.#gh(
            "GET",
            `/repos/${this.repoId()}/commits?per_page=${limit}`,
        );
        return Array.isArray(res)
            ? res.map((c) => ({
                  sha: c.sha,
                  message: c.commit?.message ?? "",
                  at: c.commit?.author?.date ?? "",
              }))
            : [];
    }

    async fork({ into, source }) {
        const res = await this.#gh(
            "POST",
            `/repos/${this.ref.caller}/${this.ref.agent}-${source}/forks`,
            {
                name: `${this.ref.agent}-${into}`,
            },
        );
        return { repo: res?.name ?? into };
    }

    async #gh(method, path, body) {
        const r = await fetch(`${this.apiBase}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${this.token}`,
                accept: "application/vnd.github+json",
                "content-type": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!r.ok)
            throw new StorageContractError(
                `github ${method} ${path} -> ${r.status}`,
            );
        return r.status === 204 ? null : await r.json().catch(() => null);
    }
}
