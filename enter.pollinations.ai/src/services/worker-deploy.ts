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

// Script names become workers.dev DNS labels; slug each part and let the
// Cloudflare API reject anything still invalid (e.g. over-long names).
export function communityWorkerScriptName(
    ownerGithubUsername: string,
    modelName: string,
): string {
    const slug = (value: string) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return `bee-${slug(ownerGithubUsername)}-${slug(modelName)}`;
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

// Uploads a single-ES-module worker, exposes it on workers.dev, and returns
// the OpenAI-compatible base URL callers should be routed to.
export async function deployCommunityWorker(
    config: WorkerDeployConfig,
    scriptName: string,
    source: string,
): Promise<string> {
    const form = new FormData();
    form.set(
        "metadata",
        JSON.stringify({
            main_module: "index.mjs",
            compatibility_date: WORKER_COMPATIBILITY_DATE,
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
