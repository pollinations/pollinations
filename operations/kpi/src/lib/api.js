import { dashboard } from "../auth";

// All private reads use Enter’s existing session.
async function getRows(path) {
    const res = await dashboard.fetch(path);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
}

export const registrations = () => getRows("/kpi/registrations");
export const activations = () => getRows("/kpi/activations");
export const revenue = (weeks) => getRows(`/kpi/revenue?weeks_back=${weeks}`);
export const appSubmissions = () => getRows("/kpi/app-submissions");

export const weekly = (pipe, weeks) =>
    getRows(`/kpi/${pipe}?weeks_back=${weeks}`);

export async function github() {
    const res = await dashboard.fetch("/kpi/github");
    if (!res.ok) return { stars: 0, forks: 0 };
    return res.json();
}
