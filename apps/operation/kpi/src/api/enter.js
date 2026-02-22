// Calls worker API (no secrets in frontend)

export async function getWeeklyRegistrations(weeksBack = 12) {
    const res = await fetch(`/api/kpi/registrations?weeks_back=${weeksBack}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
}

export async function getTotalUsers() {
    const res = await fetch("/api/kpi/total-users");
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total;
}

export async function getTierDistribution() {
    const res = await fetch("/api/kpi/tiers");
    if (!res.ok) return [];
    const data = await res.json();
    return data.data;
}
