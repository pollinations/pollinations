// All reads go through the Worker — no tokens ever reach the browser.
async function getRows(path) {
    const res = await fetch(path);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
}

export const registrations = () => getRows("/api/kpi/registrations");
export const activations = () => getRows("/api/kpi/activations");
export const revenue = (weeks) =>
    getRows(`/api/kpi/revenue?weeks_back=${weeks}`);
export const appSubmissions = () => getRows("/api/kpi/app-submissions");

export const weekly = (pipe, weeks) =>
    getRows(`/api/kpi/${pipe}?weeks_back=${weeks}`);

export async function github() {
    const res = await fetch("/api/kpi/github");
    if (!res.ok) return { stars: 0, forks: 0 };
    return res.json();
}
