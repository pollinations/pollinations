// Daily public repository totals; the Actions token never reaches the dashboard.
const repo = "pollinations/pollinations";
const branch = "kpi-data";
const path = "github-stars.json";
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
