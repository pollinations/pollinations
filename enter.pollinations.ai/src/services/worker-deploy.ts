const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const WORKER_COMPATIBILITY_DATE = "2026-01-01";

export type WorkerDeployConfig = {
    accountId: string;
    apiToken: string;
};

type WorkerDeployEnv = {
    CF_WORKER_DEPLOY_ACCOUNT_ID?: string;
    CF_WORKER_DEPLOY_API_TOKEN?: string;
};

export function requireWorkerDeployConfig(env: unknown): WorkerDeployConfig {
    const { CF_WORKER_DEPLOY_ACCOUNT_ID, CF_WORKER_DEPLOY_API_TOKEN } =
        env as WorkerDeployEnv;
    if (!CF_WORKER_DEPLOY_ACCOUNT_ID || !CF_WORKER_DEPLOY_API_TOKEN) {
        throw new Error(
            "Source-based deploys are not configured (CF_WORKER_DEPLOY_ACCOUNT_ID / CF_WORKER_DEPLOY_API_TOKEN)",
        );
    }
    return {
        accountId: CF_WORKER_DEPLOY_ACCOUNT_ID,
        apiToken: CF_WORKER_DEPLOY_API_TOKEN,
    };
}

// Script name is derived from the endpoint's UUID (a DNS-safe label already),
// not the model name: the name can be renamed and slugs of different names
// can collide (`foo.bar` vs `foo-bar`), which would let one model overwrite
// another's script. The id is immutable and unique, so a rename redeploys the
// same script and two endpoints can never share one.
export function communityWorkerScriptName(endpointId: string): string {
    return `bee-${endpointId}`;
}

async function cfApi(
    config: WorkerDeployConfig,
    path: string,
    init: RequestInit,
): Promise<unknown> {
    const response = await fetch(
        `${CF_API_BASE}/accounts/${config.accountId}${path}`,
        {
            ...init,
            headers: {
                ...init.headers,
                Authorization: `Bearer ${config.apiToken}`,
            },
        },
    );
    const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        errors?: { code?: number; message?: string }[];
        result?: unknown;
    } | null;
    if (!response.ok || !body?.success) {
        const details = body?.errors
            ?.map((error) => error.message)
            .filter(Boolean)
            .join("; ");
        throw new Error(
            `Cloudflare API ${init.method ?? "GET"} ${path} failed (${response.status})${details ? `: ${details}` : ""}`,
        );
    }
    return body.result;
}

// Uploads a single-ES-module worker with a BEE_AUTH_TOKEN secret binding,
// exposes it on workers.dev, and returns the OpenAI-compatible base URL
// callers should be routed to. The worker (and the community proxy) use the
// token to reject direct public callers — the workers.dev URL is public, so
// without it anyone with the URL could bypass the gateway's billing and, for
// agents, spend the owner's key.
export async function deployCommunityWorker(
    config: WorkerDeployConfig,
    scriptName: string,
    source: string,
    authToken: string,
): Promise<string> {
    const form = new FormData();
    form.set(
        "metadata",
        JSON.stringify({
            main_module: "index.mjs",
            compatibility_date: WORKER_COMPATIBILITY_DATE,
            bindings: [
                {
                    type: "secret_text",
                    name: "BEE_AUTH_TOKEN",
                    text: authToken,
                },
            ],
        }),
    );
    form.set(
        "index.mjs",
        new File([source], "index.mjs", {
            type: "application/javascript+module",
        }),
    );
    await cfApi(config, `/workers/scripts/${scriptName}`, {
        method: "PUT",
        body: form,
    });
    await cfApi(config, `/workers/scripts/${scriptName}/subdomain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
    });
    const subdomain = (await cfApi(config, "/workers/subdomain", {
        method: "GET",
    })) as { subdomain?: string } | null;
    if (!subdomain?.subdomain) {
        throw new Error(
            "Cloudflare account has no workers.dev subdomain configured",
        );
    }
    return `https://${scriptName}.${subdomain.subdomain}.workers.dev/v1`;
}

// Removes a deployed worker script so it is no longer publicly callable.
// Idempotent: a 404 (already gone) is treated as success.
export async function deleteCommunityWorker(
    config: WorkerDeployConfig,
    scriptName: string,
): Promise<void> {
    const response = await fetch(
        `${CF_API_BASE}/accounts/${config.accountId}/workers/scripts/${scriptName}?force=true`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${config.apiToken}` },
        },
    );
    if (response.ok || response.status === 404) return;
    const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[];
    } | null;
    const details = body?.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ");
    throw new Error(
        `Cloudflare API DELETE /workers/scripts/${scriptName} failed (${response.status})${details ? `: ${details}` : ""}`,
    );
}
