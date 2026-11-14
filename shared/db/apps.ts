// Apps people build on Pollinations. An approved app is listed in the public
// catalog unless its owner took it out or deleted it; any other app is private.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const app = sqliteTable("app", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    platform: text("platform").notNull(),
    language: text("language"),
    url: text("url"),
    repositoryUrl: text("repository_url"),
    screenshotUrl: text("screenshot_url"),
    // The author's GitHub account; matches user.github_id.
    githubUserId: integer("github_user_id"),
    githubUsername: text("github_username"),
    discordUsername: text("discord_username"),
    // Calendar dates, YYYY-MM-DD.
    submittedDate: text("submitted_date"),
    issueUrl: text("issue_url"),
    approvedDate: text("approved_date"),
    // The owner took an approved app out of the catalog.
    unlisted: integer("unlisted", { mode: "boolean" }).notNull().default(false),
    // The owner deleted the app. The row stays so the catalog import does not
    // add the app again.
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});
