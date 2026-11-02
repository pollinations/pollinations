// Daily public repository totals; the Actions token never reaches the dashboard.
const repo = "pollinations/pollinations";
const branch = "kpi-data";
const path = "github-stars.json";
const submissionsPath = "github-app-submissions.json";
const submissionsSince = "2025-10-01";
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required");

async function github(path, method = "GET", body) {
    const response = await fetch(
        `https://api.github.com/repos/${repo}/${path}`,
        {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body: body ? JSON.stringify(body) : undefined,
        },
    );
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok)
        throw new Error(`GitHub ${method} ${path}: ${response.status}`);
    return response.json();
}

let ref = await github(`git/ref/heads/${branch}`);
if (!ref) {
    const main = await github("git/ref/heads/main");
    ref = await github("git/refs", "POST", {
        ref: `refs/heads/${branch}`,
        sha: main.object.sha,
    });
}
const file = await github(`contents/${path}?ref=${branch}`);
const snapshots = file
    ? JSON.parse(Buffer.from(file.content, "base64").toString("utf8"))
    : [];
const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`GitHub repository: ${response.status}`);
const { stargazers_count: stars } = await response.json();
if (!Number.isSafeInteger(stars) || stars < 0)
    throw new Error("Invalid star count");
const capturedAt = new Date().toISOString();
const date = capturedAt.slice(0, 10);
// Keep the first observation of the day, including on workflow retries.
if (!snapshots.some((snapshot) => snapshot.date === date)) {
    snapshots.push({ date, stars, capturedAt });
    await github(`contents/${path}`, "PUT", {
        branch,
        sha: file?.sha,
        message: `chore: snapshot GitHub stars ${date}`,
        content: Buffer.from(
            `${JSON.stringify(snapshots, null, 2)}\n`,
        ).toString("base64"),
    });
    console.log(`Recorded ${stars} stars on ${date}`);
}

// Weekly APP-SUBMISSION issues, recounted each run because a label can be
// added after an issue opens. The file changes only when a count does.
const weekly = {};
for (let page = 1; ; page++) {
    const issues = await github(
        `issues?state=all&labels=APP-SUBMISSION&since=${submissionsSince}T00:00:00Z&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
        if (issue.pull_request || issue.created_at < submissionsSince) continue;
        const monday = new Date(issue.created_at.slice(0, 10));
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        const week = monday.toISOString().slice(0, 10);
        weekly[week] = (weekly[week] ?? 0) + 1;
    }
    if (issues.length < 100) break;
}
const submissions = Object.entries(weekly)
    .map(([week, submitted]) => ({ week, submitted }))
    .sort((a, b) => a.week.localeCompare(b.week));
const content = `${JSON.stringify(submissions, null, 2)}\n`;
const submissionsFile = await github(
    `contents/${submissionsPath}?ref=${branch}`,
);
const stored =
    submissionsFile &&
    Buffer.from(submissionsFile.content, "base64").toString("utf8");
if (stored !== content) {
    await github(`contents/${submissionsPath}`, "PUT", {
        branch,
        sha: submissionsFile?.sha,
        message: `chore: snapshot app submissions ${date}`,
        content: Buffer.from(content).toString("base64"),
    });
    console.log(`Recorded app submissions for ${submissions.length} weeks`);
}
