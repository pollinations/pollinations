// Apps people build on Pollinations. An app with an approval date is listed in
// the public catalog; without one it is private.

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
});
