import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
});

const file = (data, sha) => ({
    sha,
    content: Buffer.from(
        typeof data === "string" ? data : JSON.stringify(data),
    ).toString("base64"),
});

function stubGitHub({ stars, starsFile, submissionsFile, issuePages = [] }) {
    const fetch = vi.fn(async (url, options = {}) => {
        const { pathname, searchParams } = new URL(url);
        if (options.method === "PUT") return Response.json({});
        if (pathname.endsWith("/git/ref/heads/kpi-data"))
            return Response.json({ object: { sha: "branch" } });
        if (pathname.endsWith("/contents/github-stars.json"))
            return Response.json(starsFile);
        if (pathname.endsWith("/contents/github-app-submissions.json"))
            return submissionsFile
                ? Response.json(submissionsFile)
                : new Response("Not found", { status: 404 });
        if (pathname.endsWith("/issues"))
            return Response.json(
                issuePages[Number(searchParams.get("page")) - 1] ?? [],
            );
        return Response.json({ stargazers_count: stars });
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

const puts = (fetch, path) =>
    fetch.mock.calls
        .filter(
            ([url, options]) => options?.method === "PUT" && url.endsWith(path),
        )
        .map(([, options]) => JSON.parse(options.body));

const decode = (put) =>
    JSON.parse(Buffer.from(put.content, "base64").toString());

async function run(now, github) {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(now) });
    vi.stubEnv("GH_TOKEN", "test-only-token");
    const fetch = stubGitHub(github);
    await import("../scripts/snapshot-github.mjs");
    return fetch;
}

it("appends an authenticated snapshot while preserving history and using the file SHA", async () => {
    const history = [
        { date: "2026-09-28", stars: 100, capturedAt: "2026-09-28T00:17:00Z" },
    ];
    const fetch = await run("2026-09-29T00:17:00Z", {
        stars: 98,
        starsFile: file(history, "file"),
    });
    const [update] = puts(fetch, "github-stars.json");
    expect(update).toMatchObject({ branch: "kpi-data", sha: "file" });
    expect(decode(update)).toEqual([
        ...history,
        {
            date: "2026-09-29",
            stars: 98,
            capturedAt: "2026-09-29T00:17:00.000Z",
        },
    ]);
    for (const [, options] of fetch.mock.calls) {
        expect(options.headers.Authorization).toBe("Bearer test-only-token");
    }
});

it("does not replace a day's first snapshot on a retry", async () => {
    const fetch = await run("2026-09-29T04:00:00Z", {
        stars: 110,
        starsFile: file([{ date: "2026-09-29", stars: 98 }], "file"),
    });
    expect(puts(fetch, "github-stars.json")).toEqual([]);
});

it("counts app submissions per UTC week across pages, skipping PRs and older issues", async () => {
    const page = Array.from({ length: 98 }, () => ({
        created_at: "2026-09-21T12:00:00Z",
    }));
    page.push({ created_at: "2026-09-21T12:00:00Z", pull_request: {} });
    page.push({ created_at: "2025-09-01T12:00:00Z" });
    const fetch = await run("2026-09-29T00:17:00Z", {
        stars: 98,
        starsFile: file([{ date: "2026-09-29", stars: 98 }], "file"),
        issuePages: [
            page,
            [
                { created_at: "2026-09-27T23:59:59Z" },
                { created_at: "2026-09-28T00:00:00Z" },
            ],
        ],
    });
    const [update] = puts(fetch, "github-app-submissions.json");
    expect(update).toMatchObject({ branch: "kpi-data" });
    expect(decode(update)).toEqual([
        { week: "2026-09-21", submitted: 99 },
        { week: "2026-09-28", submitted: 1 },
    ]);
});

it("leaves the submissions file alone when no count changed", async () => {
    const weeks = [{ week: "2026-09-21", submitted: 1 }];
    const fetch = await run("2026-09-29T00:17:00Z", {
        stars: 98,
        starsFile: file([{ date: "2026-09-29", stars: 98 }], "file"),
        submissionsFile: file(`${JSON.stringify(weeks, null, 2)}\n`, "subs"),
        issuePages: [[{ created_at: "2026-09-21T12:00:00Z" }]],
    });
    expect(puts(fetch, "github-app-submissions.json")).toEqual([]);
});
