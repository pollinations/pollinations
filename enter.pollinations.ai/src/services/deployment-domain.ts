const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEPLOYMENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type DeploymentDomainBindings = {
    APP_DEPLOY_HOST?: string;
    APP_DEPLOY_SERVICE?: string;
    APP_DEPLOY_ZONE_ID?: string;
    CF_WORKER_DEPLOY_API_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
};

type DeploymentDomainConfig = {
    accountId: string;
    apiToken: string;
    host: string;
    service: string;
    zoneId: string;
};

function requireConfig(env: DeploymentDomainBindings): DeploymentDomainConfig {
    const {
        APP_DEPLOY_HOST: host,
        APP_DEPLOY_SERVICE: service,
        APP_DEPLOY_ZONE_ID: zoneId,
        CF_WORKER_DEPLOY_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
    } = env;
    if (!accountId || !apiToken || !host || !service || !zoneId) {
        throw new Error("Frontend deployment domains are not configured");
    }
    return { accountId, apiToken, host, service, zoneId };
}

function deploymentHostname(config: DeploymentDomainConfig, slug: string) {
    if (!DEPLOYMENT_SLUG_PATTERN.test(slug)) {
        throw new Error("Invalid deployment slug");
    }
    return `${slug}.${config.host}`;
}

async function cloudflareRequest(
    config: DeploymentDomainConfig,
    path: string,
    init: RequestInit,
): Promise<unknown> {
    const response = await fetch(
        `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}${path}`,
        {
            ...init,
            headers: {
                ...init.headers,
                Authorization: `Bearer ${config.apiToken}`,
            },
        },
    );
    const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[];
        result?: unknown;
        success?: boolean;
    } | null;
    if (!response.ok || !body?.success) {
        const details = body?.errors
            ?.map((error) => error.message)
            .filter(Boolean)
            .join("; ");
        throw new Error(
            `Cloudflare domain request failed (${response.status})${details ? `: ${details}` : ""}`,
        );
    }
    return body.result;
}

export async function attachDeploymentDomain(
    env: DeploymentDomainBindings,
    slug: string,
): Promise<void> {
    const config = requireConfig(env);
    await cloudflareRequest(config, "/workers/domains", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            hostname: deploymentHostname(config, slug),
            service: config.service,
            zone_id: config.zoneId,
        }),
    });
}

export async function detachDeploymentDomain(
    env: DeploymentDomainBindings,
    slug: string,
): Promise<void> {
    const config = requireConfig(env);
    const hostname = deploymentHostname(config, slug);
    const domains = (await cloudflareRequest(
        config,
        `/workers/domains?hostname=${encodeURIComponent(hostname)}&zone_id=${config.zoneId}`,
        { method: "GET" },
    )) as { id?: string; service?: string }[] | null;
    const domainId = domains?.find(
        (domain) => domain.service === config.service,
    )?.id;
    if (!domainId) return;

    const response = await fetch(
        `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/workers/domains/${domainId}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${config.apiToken}` },
        },
    );
    if (response.ok || response.status === 404) return;
    throw new Error(`Cloudflare domain delete failed (${response.status})`);
}
