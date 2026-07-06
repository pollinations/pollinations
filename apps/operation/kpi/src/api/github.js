// Calls worker API (no secrets in frontend)

export async function getGitHubStats() {
    const res = await fetch("/api/kpi/github");
    if (!res.ok) return { stars: 0, forks: 0, watchers: 0, error: true };
    return await res.json();
}

export async function getStarHistory(_days = 30) {
    const stats = await getGitHubStats();
    return {
        current: stats.stars,
        history: [], // TODO: implement star history tracking when needed
    };
}
