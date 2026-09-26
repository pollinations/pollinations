// The dashboard auth package owns / on its host. Enter keeps its own root.
export const ENTER_ORIGIN = "http://localhost:4180";
export const ADMIN_ORIGIN = "http://localhost:4182";

export function screenOrigin(screen: string | null) {
    return screen === "dashboard-sign-in" || screen === "dashboard-connected"
        ? ADMIN_ORIGIN
        : ENTER_ORIGIN;
}
