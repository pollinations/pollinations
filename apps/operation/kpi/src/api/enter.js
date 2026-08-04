// Calls worker API (no secrets in frontend)

export async function getWeeklyRegistrations(weeksBack = 12) {
    const res = await fetch(`/api/kpi/registrations?weeks_back=${weeksBack}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
}
