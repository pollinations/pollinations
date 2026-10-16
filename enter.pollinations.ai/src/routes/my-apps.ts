import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    fetchTinybirdRows,
    requireTinybirdReadToken,
} from "../services/tinybird.ts";

/**
 * My Apps — the signed-in developer's listings in the community app catalog
 * (operations/app-management/app.json, read through the public
 * `app_directory_public` Tinybird pipe like the listed-app quest). Served as
 * gen.pollinations.ai/account/my-apps, next to /account/my-models.
 */

// One catalog row as the app_directory_public pipe returns it. Written by
// operations/app-management/sync-to-tinybird.js; stars and usage arrive as
// strings ("⭐1.2k", "12") or empty when the catalog has none.
type AppDirectoryRow = {
    name: string;
    emoji: string;
    web_url: string;
    screenshot_url: string;
    description: string;
    language: string;
    category: string;
    platform: string;
    github_user_id: string;
    github_repository_url: string;
    github_repository_stars: string;
    submitted_date: string;
    issue_url: string;
    approved_date: string;
    byop: boolean | string | number | null;
    requests_24h: number | string | null;
};

const listedAppSchema = z.object({
    name: z.string().describe("App name"),
    emoji: z.string().describe("The catalog emoji shown with the name"),
    description: z.string().describe("What the app does"),
    webUrl: z.string().describe("The app's web URL, if it has one"),
    screenshotUrl: z
        .string()
        .describe("The catalog screenshot, if there is one"),
    category: z.string().describe("Catalog category (e.g. build, play)"),
    platform: z.string().describe("Where it runs, comma-separated"),
    language: z.string().describe("UI languages, BCP 47 tags, comma-separated"),
    byop: z
        .boolean()
        .describe("Whether the app's users can spend their own Pollen in it"),
    repositoryUrl: z.string().describe("GitHub repository URL, if linked"),
    repositoryStars: z
        .string()
        .describe("Repository stars as the catalog formats them, e.g. ⭐1.2k"),
    requests24h: z
        .number()
        .nullable()
        .describe(
            "Requests the app made to Pollinations over the last 24 hours",
        ),
    approvedDate: z.string().describe("When the listing was approved"),
    issueUrl: z.string().describe("The listing's submission issue"),
});

const myAppsResponseSchema = z.object({
    apps: z
        .array(listedAppSchema)
        .describe("The caller's listings, newest first"),
});

export type ListedApp = z.infer<typeof listedAppSchema>;

// The catalog's own signals, reused so the dashboard cannot drift from the
// website's directory view: a listing is identified by name and URL, not name
// alone.
const appIdentity = (row: AppDirectoryRow) =>
    `${row.name.toLowerCase()}|${row.web_url || row.github_repository_url}`;

const isByop = (row: AppDirectoryRow) =>
    row.byop === true || row.byop === 1 || row.byop === "true";

const requests24h = (row: AppDirectoryRow): number | null => {
    // The catalog sync writes an empty string when there is no count yet.
    if (row.requests_24h === null || row.requests_24h === "") return null;
    const parsed = Number(row.requests_24h);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

function toListedApp(row: AppDirectoryRow): ListedApp {
    return {
        name: row.name,
        emoji: row.emoji,
        description: row.description,
        webUrl: row.web_url,
        screenshotUrl: row.screenshot_url,
        category: row.category,
        platform: row.platform,
        language: row.language,
        byop: isByop(row),
        repositoryUrl: row.github_repository_url,
        repositoryStars: row.github_repository_stars,
        requests24h: requests24h(row),
        approvedDate: row.approved_date,
        issueUrl: row.issue_url,
    };
}

export const myAppsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: false, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get My Apps",
            description:
                "Returns the apps you listed in the community catalog, matched to your GitHub account, newest first. Read from the catalog's public directory.",
            responses: {
                200: {
                    description: "Your listed apps",
                    content: {
                        "application/json": {
                            schema: resolver(myAppsResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                502: {
                    description: "The app directory is temporarily unavailable",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();

            const db = drizzle(c.env.DB);
            const [account] = await db
                .select({ githubId: userTable.githubId })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);
            const githubId = account?.githubId ?? null;

            // No GitHub account to match listings against: show the empty state.
            if (githubId === null) {
                return c.json({ apps: [] });
            }

            let rows: AppDirectoryRow[];
            try {
                rows = await fetchTinybirdRows<AppDirectoryRow>(
                    new URL(c.env.TINYBIRD_INGEST_URL).origin,
                    "/v0/pipes/app_directory_public.json",
                    requireTinybirdReadToken(c.env),
                    { limit: "5000" },
                );
            } catch (error) {
                c.get("log").error(
                    "MY_APPS_DIRECTORY: userId={userId} error={error}",
                    { userId: user.id, error: String(error) },
                );
                throw new HTTPException(502, {
                    message:
                        "The app directory is unavailable. Try again shortly.",
                });
            }

            const githubUserId = String(githubId);
            const seen = new Set<string>();
            const apps = rows
                .filter(
                    (row) => row.name && row.github_user_id === githubUserId,
                )
                .filter((row) => {
                    const identity = appIdentity(row);
                    if (seen.has(identity)) return false;
                    seen.add(identity);
                    return true;
                })
                .sort((a, b) =>
                    (b.approved_date || "").localeCompare(
                        a.approved_date || "",
                    ),
                )
                .map(toListedApp);

            return c.json({ apps });
        },
    );
