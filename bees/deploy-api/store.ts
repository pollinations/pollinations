// In-memory deployment store. Models the control plane as a state machine —
// deployments transition through known statuses and emit events on every
// transition. A real platform would back this with KV/DO/Postgres; the
// interface stays the same.
//
// Why a state machine? Codex's reference creates deployments at "queued" and
// they stay there forever. That makes the events endpoint useless — there's
// nothing to report. With a real machine, `polli bees events <id>` actually
// shows you build progress, and a bee in `failed` state can be retried.

import type {
    DeployManifest,
    ResolvedDeployManifest,
} from "./manifest-deploy.ts";
import { resolveDeployManifest } from "./manifest-deploy.ts";

export type DeploymentStatus =
    | "queued" // accepted by control plane, not yet picked up by builder
    | "building" // builder fetching source / building image
    | "ready" // bee is live and accepting traffic
    | "failed" // build or runtime startup failed
    | "deleted"; // tombstone — kept for events lookup

const ALLOWED_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
    queued: ["building", "failed", "deleted"],
    building: ["ready", "failed", "deleted"],
    ready: ["building", "failed", "deleted"], // building = re-deploy
    failed: ["queued", "deleted"], // retry
    deleted: [], // terminal
};

export type DeploymentEvent = {
    deploymentId: string;
    type: string;
    message?: string;
    fromStatus?: DeploymentStatus;
    toStatus?: DeploymentStatus;
    createdAt: string;
};

export type Deployment = {
    id: string;
    name: string;
    status: DeploymentStatus;
    manifest: ResolvedDeployManifest;
    surfaces: { kind: string; url: string }[];
    createdAt: string;
    updatedAt: string;
    // Last error message if status === "failed", otherwise undefined.
    lastError?: string;
};

export function deploymentIdFromName(name: string): string {
    // Same scheme as codex (bee_<slug>) for cross-tool compatibility, but our
    // validator already enforces kebab-case so we don't re-slugify here —
    // names that pass validation map 1:1 to ids.
    return `bee_${name}`;
}

export function projectSurfaceUrls(
    baseUrl: string,
    deploymentId: string,
    surfaces: readonly string[],
): { kind: string; url: string }[] {
    const root = `${baseUrl.replace(/\/$/, "")}/bees/${deploymentId}`;
    return surfaces.map((kind) => {
        if (kind === "openai")
            return { kind, url: `${root}/v1/chat/completions` };
        if (kind === "a2a")
            return { kind, url: `${root}/.well-known/agent-card.json` };
        if (kind === "discord")
            return { kind, url: `${root}/discord/messages` };
        if (kind === "web") return { kind, url: `${root}/web/messages` };
        if (kind === "rest") return { kind, url: `${root}/run` };
        if (kind === "cli") return { kind, url: `${root}/cli/exec` };
        return { kind, url: root };
    });
}

export type CreateOptions = {
    baseUrl?: string;
    /** When true, an existing deployment with the same name is updated in
     *  place rather than triggering a 409. Used by `deploy --upgrade`. */
    upgrade?: boolean;
};

export class IdempotencyConflictError extends Error {
    readonly id: string;
    constructor(id: string) {
        super(
            `deployment "${id}" already exists; use update() or pass upgrade: true`,
        );
        this.id = id;
    }
}

export class InvalidTransitionError extends Error {
    readonly id: string;
    readonly from: DeploymentStatus;
    readonly to: DeploymentStatus;
    constructor(id: string, from: DeploymentStatus, to: DeploymentStatus) {
        super(`deployment ${id}: cannot transition ${from} → ${to}`);
        this.id = id;
        this.from = from;
        this.to = to;
    }
}

export class NotFoundError extends Error {
    readonly id: string;
    constructor(id: string) {
        super(`deployment ${id} not found`);
        this.id = id;
    }
}

export class DeployStore {
    #deployments = new Map<string, Deployment>();
    #events = new Map<string, DeploymentEvent[]>();

    /**
     * Create a deployment. Throws IdempotencyConflictError if `upgrade` is
     * not set and a deployment with the same id already exists.
     */
    create(manifest: DeployManifest, opts: CreateOptions = {}): Deployment {
        const { resolved, errors } = resolveDeployManifest(manifest);
        if (errors.length > 0) {
            const err = new Error(`invalid manifest: ${errors.join("; ")}`);
            (err as Error & { errors?: string[] }).errors = errors;
            throw err;
        }

        const id = deploymentIdFromName(resolved.name);
        const baseUrl = opts.baseUrl ?? "https://gen.pollinations.ai";
        const existing = this.#deployments.get(id);

        if (existing && !opts.upgrade) {
            throw new IdempotencyConflictError(id);
        }

        const now = new Date().toISOString();
        const deployment: Deployment = {
            id,
            name: resolved.name,
            status: "queued",
            manifest: resolved,
            surfaces: projectSurfaceUrls(baseUrl, id, resolved.surfaces),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };

        this.#deployments.set(id, deployment);
        this.#emit(id, {
            type: existing ? "deployment_updated" : "deployment_created",
            message: existing
                ? `Re-deploying ${resolved.name}`
                : `Queued ${resolved.name} for build`,
            toStatus: "queued",
            fromStatus: existing?.status,
        });

        return deployment;
    }

    /** Apply a partial manifest update. Triggers a re-deploy by transitioning
     *  through queued → building. */
    update(id: string, patch: Partial<DeployManifest>): Deployment {
        const current = this.#requireExists(id);
        const merged: DeployManifest = {
            ...current.manifest,
            ...patch,
            // billing is the only nested object we expect to merge
            billing: { ...current.manifest.billing, ...(patch.billing ?? {}) },
        };
        // Run through create() again to re-validate + re-resolve.
        return this.create(merged, { upgrade: true });
    }

    /** Transition a deployment to a new status. Throws on illegal transitions. */
    transition(
        id: string,
        to: DeploymentStatus,
        opts: { message?: string; lastError?: string } = {},
    ): Deployment {
        const current = this.#requireExists(id);
        if (!ALLOWED_TRANSITIONS[current.status].includes(to)) {
            throw new InvalidTransitionError(id, current.status, to);
        }
        const updated: Deployment = {
            ...current,
            status: to,
            updatedAt: new Date().toISOString(),
            lastError: to === "failed" ? opts.lastError : undefined,
        };
        this.#deployments.set(id, updated);
        this.#emit(id, {
            type: `status_${to}`,
            message: opts.message,
            fromStatus: current.status,
            toStatus: to,
        });
        return updated;
    }

    get(id: string): Deployment | undefined {
        return this.#deployments.get(id);
    }

    list(): Deployment[] {
        return [...this.#deployments.values()];
    }

    /** Events for a single deployment, oldest first. */
    events(id: string, opts: { since?: string } = {}): DeploymentEvent[] {
        const all = this.#events.get(id) ?? [];
        if (!opts.since) return all;
        return all.filter((e) => e.createdAt > opts.since!);
    }

    /** Soft-delete: marks status=deleted and emits a final event. The
     *  deployment record + event history stay queryable, which is what
     *  audit / debugging expects. */
    delete(id: string): boolean {
        const current = this.#deployments.get(id);
        if (!current || current.status === "deleted") return false;
        this.transition(id, "deleted", { message: "Deployment deleted" });
        return true;
    }

    #requireExists(id: string): Deployment {
        const current = this.#deployments.get(id);
        if (!current) throw new NotFoundError(id);
        return current;
    }

    #emit(id: string, ev: Omit<DeploymentEvent, "deploymentId" | "createdAt">) {
        const list = this.#events.get(id) ?? [];
        list.push({
            ...ev,
            deploymentId: id,
            createdAt: new Date().toISOString(),
        });
        this.#events.set(id, list);
    }
}
