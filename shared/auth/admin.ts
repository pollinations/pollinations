export const ADMIN_USER_IDS = ["Py5RZYN9c10OsC1fjUYiqMYjttf0PLGv"];

export function isAdminUser(user: {
    id: string;
    role?: string | null;
    banned?: boolean | null;
}) {
    return (
        !user.banned &&
        (ADMIN_USER_IDS.includes(user.id) ||
            user.role
                ?.split(",")
                .map((role) => role.trim())
                .includes("admin") === true)
    );
}
