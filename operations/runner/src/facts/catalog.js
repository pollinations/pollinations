// The app catalog as it stands on main, and the few listed apps worth
// comparing with a new one. Finding them is code; judging them is the agent's.
const STOP_WORDS = new Set(
    "the and with for pollinations app your you from that this into any one are ai".split(
        " ",
    ),
);
// Hosts many unrelated apps share, so a matching host says nothing.
const SHARED_HOSTS = new Set([
    "github.com",
    "huggingface.co",
    "raw.githubusercontent.com",
]);

export async function catalog(repo) {
    const res = await fetch(
        `https://raw.githubusercontent.com/${repo}/main/operations/app-management/app.json`,
        { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`catalog -> ${res.status}`);
    return res.json();
}

const words = (text) =>
    new Set(
        String(text ?? "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    );

function overlap(a, b) {
    const x = words(a);
    const y = words(b);
    if (!x.size || !y.size) return 0;
    let shared = 0;
    for (const w of x) if (y.has(w)) shared++;
    return shared / (x.size + y.size - shared);
}

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};

export function relatedApps(submission, apps, max = 5) {
    const host = hostOf(submission.appUrl);
    const text = `${submission.name} ${submission.description}`;
    return apps
        .map((app) => ({
            app,
            score:
                (host && !SHARED_HOSTS.has(host) && hostOf(app.url) === host
                    ? 1
                    : 0) + overlap(text, `${app.name} ${app.description}`),
        }))
        .filter(({ score }) => score >= 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map(({ app }, i) => ({
            id: `C${i + 1}`,
            name: app.name,
            url: app.url,
            repositoryUrl: app.repositoryUrl,
            description: app.description,
        }));
}
