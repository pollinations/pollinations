import { useCallback, useEffect, useRef, useState } from "react";

const RAW_BASE =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/social/news";
const TREE_API =
    "https://api.github.com/repos/pollinations/pollinations/git/trees/news?recursive=1";
const TREE_CACHE_KEY = "diary_tree_v1";

// --- Types ---

export interface ImageVariant {
    platform: string;
    url: string;
}

export interface TimelineEntry {
    date: string; // "2026-02-15"
    type: "day" | "week";
    dayName: string; // "Sat"
    dateLabel: string; // "Feb 15"
    weekNum: number;
    prNumbers: number[];
    images: ImageVariant[];
}

export interface EntryContent {
    title: string;
    summary: string;
    dna?: string;
}

export interface PRContent {
    prNumber: number;
    title: string;
    description: string;
    author: string;
    impact: string;
    imageUrl: string;
}

// --- Helpers ---

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekNumber(d: Date): number {
    // ISO 8601 week number (1-53)
    const target = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const dayNum = target.getUTCDay() || 7; // Mon=1 … Sun=7
    target.setUTCDate(target.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil(
        ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
}

function parseDateInfo(dateStr: string) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return {
        dayName: DAYS[d.getUTCDay()],
        dateLabel: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
        weekNum: getWeekNumber(d),
    };
}

const PLATFORM_ORDER = [
    "twitter",
    "instagram-1",
    "instagram-2",
    "instagram-3",
    "reddit",
    "linkedin",
    "discord",
];

function platformLabel(filename: string): string {
    const name = filename.replace(/\.jpg$/, "");
    const map: Record<string, string> = {
        twitter: "X",
        "instagram-1": "Instagram",
        "instagram-2": "Instagram",
        "instagram-3": "Instagram",
        reddit: "Reddit",
        linkedin: "LinkedIn",
        discord: "Discord",
    };
    return map[name] || name;
}

// --- Tree parsing ---

function buildTimeline(treePaths: string[]): TimelineEntry[] {
    const dateMap = new Map<
        string,
        {
            prNumbers: number[];
            dailyImages: string[];
            weeklyImages: string[];
            prImages: string[];
            hasWeekly: boolean;
        }
    >();

    const ensure = (date: string) => {
        if (!dateMap.has(date)) {
            dateMap.set(date, {
                prNumbers: [],
                dailyImages: [],
                weeklyImages: [],
                prImages: [],
                hasWeekly: false,
            });
        }
        // biome-ignore lint/style/noNonNullAssertion: guaranteed by has() check above
        return dateMap.get(date)!;
    };

    for (const p of treePaths) {
        // Gists: social/news/gists/2026-02-15/PR-8234.json
        const gistMatch = p.match(
            /^social\/news\/gists\/(\d{4}-\d{2}-\d{2})\/PR-(\d+)\.json$/,
        );
        if (gistMatch) {
            const entry = ensure(gistMatch[1]);
            entry.prNumbers.push(Number(gistMatch[2]));
            continue;
        }

        // Gist images: social/news/gists/2026-02-15/PR-8234.jpg
        const gistImgMatch = p.match(
            /^social\/news\/gists\/(\d{4}-\d{2}-\d{2})\/PR-(\d+)\.jpg$/,
        );
        if (gistImgMatch) {
            ensure(gistImgMatch[1]).prImages.push(`PR-${gistImgMatch[2]}.jpg`);
            continue;
        }

        // Daily images: social/news/daily/2026-02-15/images/twitter.jpg
        const dailyImgMatch = p.match(
            /^social\/news\/daily\/(\d{4}-\d{2}-\d{2})\/images\/(.+\.jpg)$/,
        );
        if (dailyImgMatch) {
            ensure(dailyImgMatch[1]).dailyImages.push(dailyImgMatch[2]);
            continue;
        }

        // Weekly images: social/news/weekly/2026-02-15/images/linkedin.jpg
        const weeklyImgMatch = p.match(
            /^social\/news\/weekly\/(\d{4}-\d{2}-\d{2})\/images\/(.+\.jpg)$/,
        );
        if (weeklyImgMatch) {
            const entry = ensure(weeklyImgMatch[1]);
            entry.weeklyImages.push(weeklyImgMatch[2]);
            entry.hasWeekly = true;
            continue;
        }

        // Weekly JSON (marks date as weekly even without images)
        const weeklyJsonMatch = p.match(
            /^social\/news\/weekly\/(\d{4}-\d{2}-\d{2})\/.+\.json$/,
        );
        if (weeklyJsonMatch) {
            ensure(weeklyJsonMatch[1]).hasWeekly = true;
        }
    }

    const timeline: TimelineEntry[] = [];

    // Sort dates chronologically
    const dates = [...dateMap.keys()].sort();

    for (const date of dates) {
        const data = dateMap.get(date);
        if (!data) continue;
        const info = parseDateInfo(date);

        // If this date has weekly content, create a week entry
        // If it also has daily content, create both (day first, then week)
        const hasDaily =
            data.dailyImages.length > 0 ||
            (!data.hasWeekly && data.prNumbers.length > 0);

        if (hasDaily && data.hasWeekly) {
            // Both day and week entries for this date
            const dayImages = buildImageVariants(
                date,
                data.dailyImages,
                data.prImages,
                "daily",
            );
            timeline.push({
                date,
                type: "day",
                ...info,
                prNumbers: data.prNumbers.sort((a, b) => a - b),
                images: dayImages,
            });

            const weekImages = buildImageVariants(
                date,
                data.weeklyImages,
                data.prImages,
                "weekly",
            );
            timeline.push({
                date,
                type: "week",
                ...info,
                prNumbers: data.prNumbers.sort((a, b) => a - b),
                images: weekImages,
            });
        } else if (data.hasWeekly) {
            const images = buildImageVariants(
                date,
                data.weeklyImages,
                data.prImages,
                "weekly",
            );
            timeline.push({
                date,
                type: "week",
                ...info,
                prNumbers: data.prNumbers.sort((a, b) => a - b),
                images,
            });
        } else {
            const images = buildImageVariants(
                date,
                data.dailyImages,
                data.prImages,
                "daily",
            );
            timeline.push({
                date,
                type: "day",
                ...info,
                prNumbers: data.prNumbers.sort((a, b) => a - b),
                images,
            });
        }
    }

    return timeline;
}

function buildImageVariants(
    date: string,
    platformImages: string[],
    prImages: string[],
    tier: "daily" | "weekly",
): ImageVariant[] {
    // Sort platform images in canonical order
    const sorted = [...platformImages].sort(
        (a, b) =>
            PLATFORM_ORDER.indexOf(a.replace(/\.jpg$/, "")) -
            PLATFORM_ORDER.indexOf(b.replace(/\.jpg$/, "")),
    );

    if (sorted.length > 0) {
        return sorted.map((filename) => ({
            platform: platformLabel(filename),
            url: `${RAW_BASE}/${tier}/${date}/images/${filename}`,
        }));
    }

    // Fallback: use PR images
    if (prImages.length > 0) {
        return prImages.map((filename) => ({
            platform: `PR ${filename.replace(/^PR-/, "").replace(/\.jpg$/, "")}`,
            url: `${RAW_BASE}/gists/${date}/${filename}`,
        }));
    }

    return [];
}

// --- Content fetching ---

const jsonCache = new Map<string, unknown>();

async function fetchJSON<T>(url: string): Promise<T | null> {
    if (jsonCache.has(url)) return jsonCache.get(url) as T;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        jsonCache.set(url, data);
        return data as T;
    } catch {
        return null;
    }
}

interface TwitterJson {
    tweet: string;
    tweet_type?: string;
}

interface LinkedInJson {
    hook: string;
    body: string;
}

interface GistJson {
    pr_number: number;
    author: string;
    gist: {
        headline: string;
        blurb: string;
        category: string;
    };
}

async function fetchTreePaths(signal: AbortSignal): Promise<string[]> {
    const res = await fetch(TREE_API, { signal });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    const paths = (data.tree as { path: string; type: string }[])
        .filter((t) => t.path.startsWith("social/news/"))
        .map((t) => t.path);
    try {
        localStorage.setItem(
            TREE_CACHE_KEY,
            JSON.stringify({
                data: paths,
                day: new Date().toISOString().slice(0, 10),
            }),
        );
    } catch {
        // localStorage full — skip caching
    }
    return paths;
}

// --- Hook ---

export function useDiaryData() {
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        async function load() {
            try {
                // Check localStorage cache (expires at start of new UTC day)
                const today = new Date().toISOString().slice(0, 10);
                const cached = localStorage.getItem(TREE_CACHE_KEY);
                let paths: string[];

                if (cached) {
                    const { data: cachedPaths, day } = JSON.parse(cached);
                    if (day === today) {
                        paths = cachedPaths;
                    } else {
                        jsonCache.clear();
                        paths = await fetchTreePaths(controller.signal);
                    }
                } else {
                    paths = await fetchTreePaths(controller.signal);
                }

                if (controller.signal.aborted) return;

                const tl = buildTimeline(paths);
                setTimeline(tl);
                setLoading(false);
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                console.error("Diary data load error:", err);
                setError(String(err));
                setLoading(false);
            }
        }

        load();

        return () => controller.abort();
    }, []);

    const getEntryContent = useCallback(
        async (
            date: string,
            type: "day" | "week",
            prNumbers: number[],
        ): Promise<EntryContent | null> => {
            const tier = type === "week" ? "weekly" : "daily";

            // Try twitter.json for title/summary
            const twitter = await fetchJSON<TwitterJson>(
                `${RAW_BASE}/${tier}/${date}/twitter.json`,
            );

            let title = "";
            let summary = "";
            let dna: string | undefined;

            if (twitter) {
                // Extract first sentence as title
                const sentences = twitter.tweet.split(/[.!]\s/);
                title = (sentences[0] || twitter.tweet)
                    .replace(/[^\w\s''—\-:,&@#]/g, "")
                    .trim();
                summary = twitter.tweet;
            }

            if (type === "week") {
                const linkedin = await fetchJSON<LinkedInJson>(
                    `${RAW_BASE}/weekly/${date}/linkedin.json`,
                );
                if (linkedin) {
                    dna = linkedin.hook;
                    if (!summary && linkedin.body) {
                        summary = linkedin.body.slice(0, 400);
                    }
                }
            }

            // Fallback: try first gist
            if (!title && prNumbers.length > 0) {
                const gist = await fetchJSON<GistJson>(
                    `${RAW_BASE}/gists/${date}/PR-${prNumbers[0]}.json`,
                );
                if (gist) {
                    title = gist.gist.headline;
                    summary = gist.gist.blurb;
                }
            }

            if (!title) return null;

            return { title, summary, dna };
        },
        [],
    );

    const getPRContent = useCallback(
        async (date: string, prNumber: number): Promise<PRContent | null> => {
            const gist = await fetchJSON<GistJson>(
                `${RAW_BASE}/gists/${date}/PR-${prNumber}.json`,
            );
            if (!gist) return null;

            return {
                prNumber: gist.pr_number,
                title: gist.gist.headline,
                description: gist.gist.blurb,
                author: gist.author,
                impact: gist.gist.category,
                imageUrl: `${RAW_BASE}/gists/${date}/PR-${prNumber}.jpg`,
            };
        },
        [],
    );

    return { timeline, loading, error, getEntryContent, getPRContent };
}
