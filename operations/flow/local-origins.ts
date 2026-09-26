// One port range per local checkout. The dashboard auth package owns / on
// its host, while Enter keeps its own root. These origins remain loopback-only.
const port = Number(process.env.FLOW_PORT ?? 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65533)
    throw new Error("FLOW_PORT must be an integer from 1024 to 65533");
export const ENTER_ORIGIN = `http://localhost:${port}`;
export const RUNTIME_ORIGIN = `http://localhost:${port + 1}`;
export const ADMIN_ORIGIN = `http://localhost:${port + 2}`;

export function screenOrigin(screen: string | null) {
    return screen === "dashboard-sign-in" || screen === "dashboard-connected"
        ? ADMIN_ORIGIN
        : ENTER_ORIGIN;
}
