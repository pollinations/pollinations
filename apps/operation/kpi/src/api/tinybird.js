// Calls worker API (no secrets in frontend)

export async function getWeeklyActivations(weeksBack = 12) {
    const res = await fetch(`/api/kpi/activations?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

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

export async function getWeeklyUserSegments(weeksBack = 12) {
    const res = await fetch(`/api/kpi/user-segments?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getWeeklyChurn(weeksBack = 12) {
    const res = await fetch(`/api/kpi/churn?weeks_back=${weeksBack}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getWeeklyAppSubmissions() {
    const res = await fetch("/api/kpi/app-submissions");
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getStripeCountryRevenue(daysBack = 15) {
    const res = await fetch(
        `/api/kpi/stripe-country-revenue?days_back=${daysBack}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getStripeTopBuyers(
    daysBack = 15,
    minCharges = 5,
    limit = 50,
) {
    const res = await fetch(
        `/api/kpi/stripe-top-buyers?days_back=${daysBack}&min_charges=${minCharges}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getStripeFailedAttempts(daysBack = 15) {
    const res = await fetch(
        `/api/kpi/stripe-failed-attempts?days_back=${daysBack}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}

export async function getStripeCountryMismatch(daysBack = 15, limit = 50) {
    const res = await fetch(
        `/api/kpi/stripe-country-mismatch?days_back=${daysBack}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
}
