import { cfApi, type WorkerDeployConfig } from "./worker-deploy.ts";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const APP_COMPATIBILITY_DATE = "2026-01-01";
// Keeps the whole JSON body (base64 inflates by 4/3) comfortably inside the
// enter worker's memory while it re-uploads files to Cloudflare. Cloudflare's
// own per-file limit is also 25 MiB.
export const MAX_APP_TOTAL_BYTES = 25 * 1024 * 1024;

// One DNS label: <slug>.pollinations.ai. Universal SSL only covers
// first-level subdomains, so nested labels are rejected by the pattern.
export const APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Infra names that must never become user apps. Hostnames that already exist
// on the origin zone (core services, apps.json apps) are additionally
// rejected by Cloudflare at attach time since no override flag is sent; this
// list covers names that may not have an origin record yet.
export const RESERVED_APP_SLUGS = new Set([
    "admin",
    "api",
    "app",
    "apps",
    "assets",
    "auth",
    "billing",
    "blog",
    "cdn",
    "dashboard",
    "dev",
    "docs",
    "help",
    "login",
    "mail",
    "oauth",
    "smtp",
    "staging",
    "static",
    "status",
    "support",
    "www",
]);

export type AppDeployConfig = WorkerDeployConfig & {
    // Zone (in the same Cloudflare account) the app origin hostname is
    // attached to, e.g. myceli.ai — the pollinations-proxy maps
    // <slug>.<publicDomain> to <slug>.<originDomain>.
    originZoneId: string;
    originDomain: string;
    publicDomain: string;
};

type AppDeployEnv = {
    CF_WORKER_DEPLOY_ACCOUNT_ID?: string;
    CF_WORKER_DEPLOY_API_TOKEN?: string;
    CF_APP_ORIGIN_ZONE_ID?: string;
    CF_APP_ORIGIN_DOMAIN?: string;
    CF_APP_PUBLIC_DOMAIN?: string;
};

export function requireAppDeployConfig(env: unknown): AppDeployConfig {
    const {
        CF_WORKER_DEPLOY_ACCOUNT_ID,
        CF_WORKER_DEPLOY_API_TOKEN,
        CF_APP_ORIGIN_ZONE_ID,
        CF_APP_ORIGIN_DOMAIN,
        CF_APP_PUBLIC_DOMAIN,
    } = env as AppDeployEnv;
    if (
        !CF_WORKER_DEPLOY_ACCOUNT_ID ||
        !CF_WORKER_DEPLOY_API_TOKEN ||
        !CF_APP_ORIGIN_ZONE_ID ||
        !CF_APP_ORIGIN_DOMAIN ||
        !CF_APP_PUBLIC_DOMAIN
    ) {
        throw new Error(
            "App deploys are not configured (CF_WORKER_DEPLOY_ACCOUNT_ID / CF_WORKER_DEPLOY_API_TOKEN / CF_APP_ORIGIN_ZONE_ID / CF_APP_ORIGIN_DOMAIN / CF_APP_PUBLIC_DOMAIN)",
        );
    }
    return {
        accountId: CF_WORKER_DEPLOY_ACCOUNT_ID,
        apiToken: CF_WORKER_DEPLOY_API_TOKEN,
        originZoneId: CF_APP_ORIGIN_ZONE_ID,
        originDomain: CF_APP_ORIGIN_DOMAIN,
        publicDomain: CF_APP_PUBLIC_DOMAIN,
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
    throw new Error(
        `Cloudflare API DELETE /workers/domains/${domainId} failed (${response.status})`,
    );
}
