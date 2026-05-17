// Calls worker API (no secrets in frontend)

export async function getWeeklyRevenue(weeksBack = 12) {
    const res = await fetch("/api/kpi/revenue");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(-weeksBack);
}
