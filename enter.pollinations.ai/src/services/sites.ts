import { Buffer } from "node:buffer";
import { site } from "@shared/db/sites.ts";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import {
    cloudflareAccountUrl,
    dispatchScriptUrl,
    requireCloudflareSuccess,
} from "./dispatch-script.ts";

// Static sites are Workers for Platforms scripts with only static assets.
// Uploads follow Cloudflare's direct upload flow: we open the upload session,
// the client uploads the files straight to Cloudflare with the session JWT,
// and we publish the script with the completion JWT. Small sites can instead
// send their files inline, and we upload them.
// https://developers.cloudflare.com/workers-for-platforms/configuration/static-assets/

type SitesEnv = {
    DB: D1Database;
    CLOUDFLARE_ACCOUNT_ID: string;
    CODE_AGENT_DEPLOY_API_TOKEN?: string;
    SITES_DISPATCH_NAMESPACE?: string;
};

export type SiteManifest = Record<string, { hash: string; size: number }>;

type UploadSession = { uploadUrl: string; jwt: string; buckets: string[][] };

// A file sent inline, as Vercel's deployment API takes them.
export type InlineSiteFile = {
    file: string;
    data: string;
    encoding?: "utf-8" | "base64";
};

// Cloudflare serves each file with the type it was uploaded with. Same table
// as the CLI's (packages/polli-cli/src/lib/mime.ts).
const CONTENT_TYPES: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    json: "application/json",
    map: "application/json",
    txt: "text/plain",
    xml: "application/xml",
    webmanifest: "application/manifest+json",
    wasm: "application/wasm",
    pdf: "application/pdf",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/x-icon",
    bmp: "image/bmp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    aac: "audio/aac",
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mov: "video/quicktime",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
};

function sitesConfig(env: SitesEnv) {
    const token = env.CODE_AGENT_DEPLOY_API_TOKEN;
    const namespace = env.SITES_DISPATCH_NAMESPACE;
    if (!token || !namespace) {
        throw new HTTPException(503, {
            message: "Site hosting is not configured",
        });
    }
    return { token, namespace };
}

// Tags every script with its owner, so deleting the account removes all of
// the owner's sites in one call.
const ownerTag = (userId: string) => `user-${userId}`;

export async function startSiteUpload(
    env: SitesEnv,
    name: string,
    manifest: SiteManifest,
): Promise<UploadSession> {
    const { token, namespace } = sitesConfig(env);
    const response = await fetch(
        `${dispatchScriptUrl(env, namespace, name)}/assets-upload-session`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ manifest }),
        },
    );
    await requireCloudflareSuccess(env, response, "Site upload");
    const { result } = (await response.json()) as {
        result: { jwt: string; buckets?: string[][] };
    };
    return {
        uploadUrl: cloudflareAccountUrl(
            env,
            "/workers/assets/upload?base64=true",
        ),
        jwt: result.jwt,
        // Empty when Cloudflare already has every file: the JWT is then the
        // completion token.
        buckets: result.buckets ?? [],
    };
}

/** Builds the upload manifest for inline files. The hash is Cloudflare's
 * example, the same as `polli sites deploy`: SHA-256 of the base64 content
 * plus the extension, first 32 hex characters. */
export async function prepareInlineFiles(files: InlineSiteFile[]) {
    const manifest: SiteManifest = {};
    // Blobs, so only one copy of each file stays in memory until upload.
    const contents = new Map<string, Blob>();
    for (const { file, data, encoding } of files) {
        const bytes = Buffer.from(
            data,
            encoding === "base64" ? "base64" : "utf8",
        );
        const base64 = bytes.toString("base64");
        const path = file.startsWith("/") ? file : `/${file}`;
        const extension = /\.([^./]+)$/.exec(path)?.[1] ?? "";
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(base64 + extension),
        );
        const hash = Buffer.from(digest).toString("hex").slice(0, 32);
        manifest[path] = { hash, size: bytes.length };
        contents.set(
            hash,
            // "application/null" serves no Content-Type, as wrangler does.
            new Blob([base64], {
                type:
                    CONTENT_TYPES[extension.toLowerCase()] ??
                    "application/null",
            }),
        );
    }
    return { manifest, contents };
}

/** Uploads the files Cloudflare doesn't have yet and returns the completion
 * JWT, as the client does in the two-step flow. */
export async function uploadSiteFiles(
    env: SitesEnv,
    session: UploadSession,
    contents: Map<string, Blob>,
) {
    let jwt = session.jwt;
    for (const bucket of session.buckets) {
        const form = new FormData();
        for (const hash of bucket) {
            const content = contents.get(hash);
            if (content) form.append(hash, content, hash);
        }
        const response = await fetch(session.uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.jwt}` },
            body: form,
        });
        await requireCloudflareSuccess(env, response, "Site upload");
        const { result } = (await response.json()) as {
            result?: { jwt?: string };
        };
        if (result?.jwt) jwt = result.jwt;
    }
    return jwt;
}

export async function publishSite(
    env: SitesEnv,
    name: string,
    userId: string,
    jwt: string,
) {
    const { token, namespace } = sitesConfig(env);
    const metadata = {
        assets: {
            jwt,
            config: {
                html_handling: "auto-trailing-slash",
                not_found_handling: "single-page-application",
            },
        },
        compatibility_date: "2026-10-01",
        tags: [ownerTag(userId)],
    };
    const form = new FormData();
    form.set(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    const response = await fetch(dispatchScriptUrl(env, namespace, name), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    await requireCloudflareSuccess(env, response, "Site publish");
}

export async function deleteSite(env: SitesEnv, name: string) {
    const { token, namespace } = sitesConfig(env);
    const response = await fetch(dispatchScriptUrl(env, namespace, name), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status !== 404) {
        await requireCloudflareSuccess(env, response, "Site delete");
    }
}

/** Takes the user's sites offline and frees their names. Blocked rows stay,
 * and lose their owner when the user is deleted, so the names stay reserved. */
export async function removeUserSites(env: SitesEnv, userId: string) {
    const db = drizzle(env.DB);
    const live = and(eq(site.userId, userId), isNull(site.blockedAt));
    const [owned] = await db
        .select({ name: site.name })
        .from(site)
        .where(live)
        .limit(1);
    if (!owned) return;
    const { token, namespace } = sitesConfig(env);
    const tags = encodeURIComponent(`${ownerTag(userId)}:yes`);
    const response = await fetch(
        cloudflareAccountUrl(
            env,
            `/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts?tags=${tags}`,
        ),
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    await requireCloudflareSuccess(env, response, "Site delete");
    await db.delete(site).where(live);
}
