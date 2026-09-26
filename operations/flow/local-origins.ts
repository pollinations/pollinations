import type { FlowOrigins } from "./flow-environment";

// Listening ports and browser origins are independent: a hosted HTTPS origin
// does not change the container's private port range.
export const PORT = Number(
    typeof window === "undefined" ? (process.env.FLOW_PORT ?? 4180) : 4180,
);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65533)
    throw new Error("FLOW_PORT must be an integer from 1024 to 65533");
export const LOCAL_ORIGINS: FlowOrigins = {
    enter: `http://localhost:${PORT}`,
    admin: `http://localhost:${PORT + 2}`,
};
function origin(value: string) {
    const url = new URL(value);
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
    )
        throw new Error(
            "Flow requires HTTP(S) origins without paths or credentials",
        );
    return url.origin;
}
export const ORIGINS: FlowOrigins =
    typeof window === "undefined"
        ? {
              enter: origin(
                  process.env.FLOW_ENTER_ORIGIN ?? LOCAL_ORIGINS.enter,
              ),
              admin: origin(
                  process.env.FLOW_ADMIN_ORIGIN ?? LOCAL_ORIGINS.admin,
              ),
          }
        : window.__FLOW_ENVIRONMENT__;
if (ORIGINS.enter === ORIGINS.admin)
    throw new Error("Enter and Admin require separate browser origins");
export const ENTER_ORIGIN = ORIGINS.enter;
export const ADMIN_ORIGIN = ORIGINS.admin;
export const RUNTIME_ORIGIN = `http://localhost:${PORT + 1}`;

export function screenOrigin(screen: string | null, origins = ORIGINS) {
    return screen === "dashboard-sign-in" || screen === "dashboard-connected"
        ? origins.admin
        : origins.enter;
}
