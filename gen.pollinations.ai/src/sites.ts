import type { Env } from "@/env.ts";
import LOCKUP_SVG from "../../packages/ui/src/brand/lockup-horizontal.svg?raw";
import LANDING_HTML from "./sites-landing.html?raw";

// User sites at <name>.pollinations.app (<name>--staging.pollinations.app on
// staging). Enter uploads each site as a static-assets script named <name>
// into the sites dispatch namespace, so the host alone picks the script.

const SITE_NAME = /^[a-z][a-z0-9-]*$/;

export function siteName(
    hostname: string,
    suffix: string | undefined,
): string | null | undefined {
    if (!suffix || !hostname.endsWith(suffix)) return undefined;
    const name = hostname.slice(0, -suffix.length);
    // Null: a host on the sites domain that can't be a site.
    return SITE_NAME.test(name) ? name : null;
}

const notFound = () =>
    new Response("Site not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

// A name with no script throws "Worker not found", as in Cloudflare's
// dispatch Worker example; a deleted site throws "this worker has been deleted".
const MISSING_SCRIPT = /^(Worker not found|this worker has been deleted)/;

async function dispatch(
    sites: DispatchNamespace,
    name: string,
    request: Request,
) {
    try {
        return await sites.get(name).fetch(request);
    } catch (error) {
        if (MISSING_SCRIPT.test((error as Error).message)) {
            return notFound();
        }
        console.error(`Site ${name} failed`, error);
        return new Response("Site unavailable", {
            status: 502,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
}

const LANDING_PAGE = LANDING_HTML.replace("<!-- lockup -->", LOCKUP_SVG);

/** Serves a sites-domain request, or returns undefined for gen's own hosts. */
export function serveSite(
    request: Request,
    env: Env["Bindings"],
): Promise<Response> | undefined {
    const { hostname, pathname } = new URL(request.url);
    // The bare domain (production only) explains pollinations.app; its font
    // and icons come from gen's public files. Site names are labels in front
    // of the suffix, so no site can take it.
    if (`.${hostname}` === env.SITES_HOST_SUFFIX) {
        if (pathname !== "/") return env.ASSETS.fetch(request);
        return Promise.resolve(
            new Response(LANDING_PAGE, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
        );
    }
    const name = siteName(hostname, env.SITES_HOST_SUFFIX);
    if (name === undefined || !env.SITES) return undefined;
    if (name === null) return Promise.resolve(notFound());
    return dispatch(env.SITES, name, request);
}
