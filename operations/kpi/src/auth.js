import { createDashboardClient } from "@pollinations/auth";

export const dashboard = createDashboardClient(import.meta.env.VITE_ENTER_URL);
export const authClient = dashboard.auth;
