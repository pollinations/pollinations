import { dashboardFetch } from "@pollinations/auth/react";

// Private reads use only this app's session, never Enter's cookie.
async function getRows(path) {
    const res = await dashboardFetch(`/api${path}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
}

export const registrations = () => getRows("/kpi/registrations");
export const dailyRegistrations = () => getRows("/kpi/registrations/daily");
export const activations = () => getRows("/kpi/activations");
export const revenue = (weeks) => getRows(`/kpi/revenue?weeks_back=${weeks}`);
export const dailyRevenue = () => getRows("/kpi/revenue/daily");
export const appSubmissions = () => getRows("/kpi/app-submissions");

export const weekly = (pipe, weeks) =>
    getRows(`/kpi/${pipe}?weeks_back=${weeks}`);

export async function github() {
    const res = await dashboardFetch("/api/kpi/github");
    if (!res.ok) return { stars: 0, forks: 0 };
    return res.json();
}
