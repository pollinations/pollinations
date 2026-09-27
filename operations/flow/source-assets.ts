import { LOCAL_ORIGINS } from "./local-origins";

// Asset reads are private transport, not product navigations. They must never
// loop through the public reviewer login or carry product credentials.
export function assetRequest(request: Request, adminOrigin: string) {
    const url = new URL(request.url);
    const path =
        url.origin === adminOrigin && url.pathname === "/"
            ? "/flow-admin.html"
            : url.pathname;
    return new Request(`${LOCAL_ORIGINS.enter}${path}${url.search}`, {
        method: request.method,
        redirect: "manual",
    });
}
