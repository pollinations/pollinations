// Calls worker API (no secrets in frontend)

export async function getWeeklyActiveUsers(weeksBack = 12) {
    const res = await fetch(`/api/kpi/wau?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getWeeklyUsageStats(weeksBack = 12) {
    const res = await fetch(`/api/kpi/usage?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getWeeklyRetention(weeksBack = 8) {
    const res = await fetch(`/api/kpi/retention?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getWeeklyHealthStats(weeksBack = 12) {
    const res = await fetch(`/api/kpi/health?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}
