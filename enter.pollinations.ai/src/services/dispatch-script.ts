import { HTTPException } from "hono/http-exception";

// Scripts in our Workers for Platforms dispatch namespaces: code agents and
// user sites.
type DispatchEnv = { CLOUDFLARE_ACCOUNT_ID: string };

export function cloudflareAccountUrl(env: DispatchEnv, path: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}${path}`;
}

export function dispatchScriptUrl(
    env: DispatchEnv,
    namespace: string,
    name: string,
) {
    return cloudflareAccountUrl(
        env,
        `/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(name)}`,
    );
}

export async function requireCloudflareSuccess(
    env: DispatchEnv,
    response: Response,
    action: string,
) {
    if (response.ok) return;
    // Cloudflare's v4 envelope names the reason, e.g. an agent that throws at
    // startup. A 400 is the owner's input; anything else is ours.
    const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[];
    } | null;
    const reason = body?.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ")
        .replaceAll(env.CLOUDFLARE_ACCOUNT_ID, "<account>")
        .slice(0, 1000);
    throw new HTTPException(response.status === 400 ? 400 : 502, {
        message: reason
            ? `${action} failed: ${reason}`
            : `${action} failed (${response.status})`,
    });
}
