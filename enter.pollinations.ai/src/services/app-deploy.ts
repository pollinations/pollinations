import {
    CF_API_BASE,
    cfApi,
    requireWorkerDeployConfig,
    type WorkerDeployConfig,
} from "./worker-deploy.ts";

const APP_COMPATIBILITY_DATE = "2026-01-01";
// Keeps the whole JSON body (base64 inflates by 4/3) comfortably inside the
// enter worker's memory while it re-uploads files to Cloudflare. Cloudflare's
// own per-file limit is also 25 MiB.
export const MAX_APP_TOTAL_BYTES = 25 * 1024 * 1024;

// One DNS label: <slug>.pollinations.ai. Universal SSL only covers
// first-level subdomains, so nested labels are rejected by the pattern.
export const APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Infra names that must never become user apps. This is the authoritative
// guard, not a nicety: a live pollinations.ai service whose origin is NOT a
// <slug>.<originDomain> record (e.g. checkout -> Stripe, image -> GPU
// backends) has nothing for Cloudflare to reject at attach time, so only this
// list stops a user from claiming that public host. It must cover every live
// or planned first-level subdomain, especially the core gateway hosts whose
// <slug>.<originDomain> IS the production upstream (claiming `gen` could point
// gen.<originDomain> at a user app). Keep it in sync as subdomains are added.
export const RESERVED_APP_SLUGS = new Set([
    // Core gateway + platform services.
    "admin",
    "api",
    "app",
    "apps",
    "assets",
    "audio",
    "auth",
    "billing",
    "blog",
    "cdn",
    "chat",
    "checkout",
    "dashboard",
    "dev",
    "docs",
    "economics",
    "enter",
    "gen",
    "help",
    "image",
    "kpi",
    "login",
    "mail",
    "media",
    "micro",
    "oauth",
    "pollen",
    "polly",
    "smtp",
    "staging",
    "static",
    "status",
    "support",
    "text",
    "video",
    "www",
]);

export type AppDeployConfig = WorkerDeployConfig & {
    // Zone (in the same Cloudflare account) the app origin hostname is
    // attached to, e.g. myceli.ai — the pollinations-proxy maps
    // <slug>.<publicDomain> to <slug>.<originDomain>.
    originZoneId: string;
    originDomain: string;
    publicDomain: string;
    // Optional public-exposure binding. The <slug>.<publicDomain> hostname
    // lives in a DIFFERENT Cloudflare account (the one that owns the public
    // zone and runs the proxy worker), so it needs its own account + token.
    // When absent, deploys still succeed but the app is reachable only at
    // <slug>.<originDomain>; attaching the public hostname is left to ops.
    proxy?: ProxyDeployConfig;
};

export type ProxyDeployConfig = {
    accountId: string;
    apiToken: string;
    publicZoneId: string;
    // The proxy worker the public hostname is attached to; its generic rule
    // forwards <slug>.<publicDomain> -> <slug>.<originDomain>.
    proxyService: string;
};

type AppDeployEnv = {
    CF_WORKER_DEPLOY_ACCOUNT_ID?: string;
    CF_WORKER_DEPLOY_API_TOKEN?: string;
    CF_APP_ORIGIN_ZONE_ID?: string;
    CF_APP_ORIGIN_DOMAIN?: string;
    CF_APP_PUBLIC_DOMAIN?: string;
    CF_PROXY_DEPLOY_ACCOUNT_ID?: string;
    CF_PROXY_DEPLOY_API_TOKEN?: string;
    CF_APP_PUBLIC_ZONE_ID?: string;
    CF_APP_PROXY_SERVICE?: string;
};

// Reads the optional public-exposure binding. Returns undefined when it is
// not fully configured — the deploy then stops at the origin hostname. All
// four vars are required together (partial config is a misconfiguration, so
// it throws rather than silently degrading).
function readProxyConfig(env: unknown): ProxyDeployConfig | undefined {
    const {
        CF_PROXY_DEPLOY_ACCOUNT_ID,
        CF_PROXY_DEPLOY_API_TOKEN,
        CF_APP_PUBLIC_ZONE_ID,
        CF_APP_PROXY_SERVICE,
    } = env as AppDeployEnv;
    const values = [
        CF_PROXY_DEPLOY_ACCOUNT_ID,
        CF_PROXY_DEPLOY_API_TOKEN,
        CF_APP_PUBLIC_ZONE_ID,
        CF_APP_PROXY_SERVICE,
    ];
    if (values.every((value) => !value)) return undefined;
    if (values.some((value) => !value)) {
        throw new Error(
            "Public app exposure is partially configured (need all of CF_PROXY_DEPLOY_ACCOUNT_ID / CF_PROXY_DEPLOY_API_TOKEN / CF_APP_PUBLIC_ZONE_ID / CF_APP_PROXY_SERVICE)",
        );
    }
    return {
        accountId: CF_PROXY_DEPLOY_ACCOUNT_ID as string,
        apiToken: CF_PROXY_DEPLOY_API_TOKEN as string,
        publicZoneId: CF_APP_PUBLIC_ZONE_ID as string,
        proxyService: CF_APP_PROXY_SERVICE as string,
    };
}

export function requireAppDeployConfig(env: unknown): AppDeployConfig {
    // Reuse the base account/token validation so its error message and any
    // future changes live in one place.
    const base = requireWorkerDeployConfig(env);
    const {
        CF_APP_ORIGIN_ZONE_ID,
        CF_APP_ORIGIN_DOMAIN,
        CF_APP_PUBLIC_DOMAIN,
    } = env as AppDeployEnv;
    if (
        !CF_APP_ORIGIN_ZONE_ID ||
        !CF_APP_ORIGIN_DOMAIN ||
        !CF_APP_PUBLIC_DOMAIN
    ) {
        throw new Error(
            "App deploys are not configured (CF_APP_ORIGIN_ZONE_ID / CF_APP_ORIGIN_DOMAIN / CF_APP_PUBLIC_DOMAIN)",
        );
    }
    return {
        ...base,
        originZoneId: CF_APP_ORIGIN_ZONE_ID,
        originDomain: CF_APP_ORIGIN_DOMAIN,
        publicDomain: CF_APP_PUBLIC_DOMAIN,
        proxy: readProxyConfig(env),
    };
}

// Script name is derived from the app's UUID, not the slug, mirroring
// communityWorkerScriptName: the hostname (slug) is claimed separately via
// the custom-domain attach, so concurrent creates for the same slug deploy
// distinct scripts and the loser cleans up only its own.
export function appWorkerScriptName(appId: string): string {
    return `app-${appId}`;
}

export function appPublicUrl(config: AppDeployConfig, slug: string): string {
    return `https://${slug}.${config.publicDomain}`;
}

// Content types are stored per uploaded asset, so files must be sent with
// the MIME type they should be served with. Unknown extensions fall back to
// octet-stream.
const CONTENT_TYPES: Record<string, string> = {
    css: "text/css",
    gif: "image/gif",
    htm: "text/html",
    html: "text/html",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    map: "application/json",
    md: "text/markdown",
    mjs: "text/javascript",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    otf: "font/otf",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    ttf: "font/ttf",
    txt: "text/plain",
    wasm: "application/wasm",
    webm: "video/webm",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    xml: "application/xml",
};

function fileExtension(path: string): string {
    const base = path.slice(path.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type AppFile = {
    path: string;
    // Canonical (re-encoded) base64 — the hash input and upload payload, so
    // formatting quirks in caller-supplied base64 never change the hash.
    base64: string;
    size: number;
};

// Validates paths and decodes base64 contents. Paths are normalized to a
// leading slash; traversal segments and empty segments are rejected.
export function decodeAppFiles(files: Record<string, string>): AppFile[] {
    const entries = Object.entries(files);
    if (entries.length === 0) {
        throw new Error("At least one file is required");
    }
    // Reject oversized payloads from the encoded length before decoding, so a
    // hostile body can't force peak memory (raw JSON + decoded copies) toward
    // the Worker's 128 MB limit. base64 is ~4/3 of the decoded size.
    const encodedBytes = entries.reduce(
        (sum, [, base64]) => sum + base64.length,
        0,
    );
    if (encodedBytes > MAX_APP_TOTAL_BYTES * 2) {
        throw new Error(
            `App exceeds the ${MAX_APP_TOTAL_BYTES / (1024 * 1024)} MiB total size limit`,
        );
    }
    const seen = new Set<string>();
    let totalBytes = 0;
    return entries.map(([rawPath, base64]) => {
        const path = `/${rawPath.replace(/^\/+/, "")}`;
        const segments = path.slice(1).split("/");
        if (
            segments.some(
                (segment) =>
                    segment === "" || segment === "." || segment === "..",
            )
        ) {
            throw new Error(`Invalid file path: ${rawPath}`);
        }
        if (seen.has(path)) {
            throw new Error(`Duplicate file path: ${rawPath}`);
        }
        seen.add(path);
        let binary: string;
        try {
            binary = atob(base64);
        } catch {
            throw new Error(`File is not valid base64: ${rawPath}`);
        }
        totalBytes += binary.length;
        if (totalBytes > MAX_APP_TOTAL_BYTES) {
            throw new Error(
                `App exceeds the ${MAX_APP_TOTAL_BYTES / (1024 * 1024)} MiB total size limit`,
            );
        }
        return { path, base64: btoa(binary), size: binary.length };
    });
}

// Manifest hash, matching Cloudflare's official SDK example: SHA-256 over
// base64 contents + extension (no dot), hex, first 32 chars. The server
// treats it as an opaque fingerprint, but the extension must participate:
// content types are stored per hash, so identical bytes with different
// extensions need distinct hashes.
async function hashAppFile(file: AppFile): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(file.base64 + fileExtension(file.path)),
    );
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
}

// Deploys the files as an assets-only Worker (no user code runs): start an
// upload session with the manifest, upload the buckets Cloudflare reports as
// missing, then upsert the script with the completion token.
export async function deployAppWorker(
    config: AppDeployConfig,
    scriptName: string,
    files: AppFile[],
): Promise<void> {
    const hashed = await Promise.all(
        files.map(async (file) => ({
            ...file,
            hash: await hashAppFile(file),
        })),
    );
    const manifest = Object.fromEntries(
        hashed.map((file) => [file.path, { hash: file.hash, size: file.size }]),
    );
    const session = (await cfApi(
        config,
        `/workers/scripts/${scriptName}/assets-upload-session`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ manifest }),
        },
    )) as { jwt?: string; buckets?: string[][] } | null;
    if (!session?.jwt) {
        throw new Error("Cloudflare returned no asset upload session token");
    }

    // Assets are deduplicated by hash: Cloudflare only asks for buckets it
    // does not already store. With no buckets the session token is already
    // the completion token; otherwise the final upload response carries it.
    const buckets = session.buckets ?? [];
    let completionToken = buckets.length === 0 ? session.jwt : undefined;
    const byHash = new Map(hashed.map((file) => [file.hash, file]));
    for (const bucket of buckets) {
        const form = new FormData();
        for (const hash of bucket) {
            const file = byHash.get(hash);
            if (!file) {
                throw new Error(
                    `Cloudflare requested an unknown asset hash: ${hash}`,
                );
            }
            form.set(
                hash,
                new File([file.base64], hash, {
                    type:
                        CONTENT_TYPES[fileExtension(file.path)] ??
                        "application/octet-stream",
                }),
            );
        }
        const response = await fetch(
            `${CF_API_BASE}/accounts/${config.accountId}/workers/assets/upload?base64=true`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${session.jwt}` },
                body: form,
            },
        );
        const body = (await response.json().catch(() => null)) as {
            success?: boolean;
            errors?: { message?: string }[];
            result?: { jwt?: string };
        } | null;
        if (!response.ok || !body?.success) {
            const details = body?.errors
                ?.map((error) => error.message)
                .filter(Boolean)
                .join("; ");
            throw new Error(
                `Cloudflare asset upload failed (${response.status})${details ? `: ${details}` : ""}`,
            );
        }
        if (body.result?.jwt) {
            completionToken = body.result.jwt;
        }
    }
    if (!completionToken) {
        throw new Error("Cloudflare returned no asset completion token");
    }

    const form = new FormData();
    form.set(
        "metadata",
        JSON.stringify({
            compatibility_date: APP_COMPATIBILITY_DATE,
            assets: {
                jwt: completionToken,
                config: {
                    html_handling: "auto-trailing-slash",
                    not_found_handling: "single-page-application",
                },
            },
        }),
    );
    await cfApi(config, `/workers/scripts/${scriptName}`, {
        method: "PUT",
        body: form,
    });
}

// Attaches <slug>.<originDomain> to the app worker; Cloudflare provisions
// DNS and TLS. No override flags are passed on purpose: a hostname that
// already has a DNS record or custom domain (core services, apps.json apps,
// a racing create) makes Cloudflare reject the attach instead of silently
// stealing it.
export async function attachAppDomain(
    config: AppDeployConfig,
    hostname: string,
    scriptName: string,
): Promise<void> {
    await cfApi(config, "/workers/domains", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            zone_id: config.originZoneId,
            hostname,
            service: scriptName,
        }),
    });
}

// Detaches the app hostname, but only when it points at the given script —
// a hostname owned by another script (e.g. the winner of a create race) is
// left alone. Idempotent: a hostname that is not attached is a success.
export async function detachAppDomain(
    config: AppDeployConfig,
    hostname: string,
    scriptName: string,
): Promise<void> {
    const attached = (await cfApi(
        config,
        `/workers/domains?hostname=${encodeURIComponent(hostname)}&zone_id=${config.originZoneId}`,
        { method: "GET" },
    )) as { id?: string; service?: string }[] | null;
    const domainId = attached?.find(
        (domain) => domain.service === scriptName,
    )?.id;
    if (!domainId) return;
    const response = await fetch(
        `${CF_API_BASE}/accounts/${config.accountId}/workers/domains/${domainId}`,
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
        `Cloudflare API DELETE /workers/domains/${domainId} failed (${response.status})${details ? `: ${details}` : ""}`,
    );
}

// Minimal Cloudflare call against the PROXY account (a different account +
// token than the origin), used only for the public custom-domain lifecycle.
async function proxyApi(
    proxy: ProxyDeployConfig,
    path: string,
    init: RequestInit,
): Promise<unknown> {
    const response = await fetch(
        `${CF_API_BASE}/accounts/${proxy.accountId}${path}`,
        {
            ...init,
            headers: {
                ...init.headers,
                Authorization: `Bearer ${proxy.apiToken}`,
            },
        },
    );
    const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        errors?: { message?: string }[];
        result?: unknown;
    } | null;
    if (!response.ok || !body?.success) {
        const details = body?.errors
            ?.map((error) => error.message)
            .filter(Boolean)
            .join("; ");
        throw new Error(
            `Cloudflare proxy API ${init.method ?? "GET"} ${path} failed (${response.status})${details ? `: ${details}` : ""}`,
        );
    }
    return body.result;
}

// Attaches the public hostname <slug>.<publicDomain> to the proxy worker in
// the public zone's account. The proxy's generic rule then forwards it to
// <slug>.<originDomain> where the app worker serves. No-op when public
// exposure is not configured (app stays reachable only at the origin host).
// No override flags: an already-claimed public host (a core service, an
// apps.json app) is rejected rather than stolen.
export async function attachPublicDomain(
    config: AppDeployConfig,
    hostname: string,
): Promise<void> {
    const { proxy } = config;
    if (!proxy) return;
    await proxyApi(proxy, "/workers/domains", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            zone_id: proxy.publicZoneId,
            hostname,
            service: proxy.proxyService,
        }),
    });
}

// Detaches the public hostname, but only when it points at the proxy service
// (never touches a host owned by something else). Idempotent; no-op when
// public exposure is not configured.
export async function detachPublicDomain(
    config: AppDeployConfig,
    hostname: string,
): Promise<void> {
    const { proxy } = config;
    if (!proxy) return;
    const attached = (await proxyApi(
        proxy,
        `/workers/domains?hostname=${encodeURIComponent(hostname)}&zone_id=${proxy.publicZoneId}`,
        { method: "GET" },
    )) as { id?: string; service?: string }[] | null;
    const domainId = attached?.find(
        (domain) => domain.service === proxy.proxyService,
    )?.id;
    if (!domainId) return;
    const response = await fetch(
        `${CF_API_BASE}/accounts/${proxy.accountId}/workers/domains/${domainId}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${proxy.apiToken}` },
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
        `Cloudflare proxy API DELETE /workers/domains/${domainId} failed (${response.status})${details ? `: ${details}` : ""}`,
    );
}
