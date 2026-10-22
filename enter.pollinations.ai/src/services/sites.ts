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
// and we publish the script with the completion JWT.
// https://developers.cloudflare.com/workers-for-platforms/configuration/static-assets/

type SitesEnv = {
    DB: D1Database;
    CLOUDFLARE_ACCOUNT_ID: string;
    CODE_AGENT_DEPLOY_API_TOKEN?: string;
    SITES_DISPATCH_NAMESPACE?: string;
};

export type SiteManifest = Record<string, { hash: string; size: number }>;

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
) {
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
