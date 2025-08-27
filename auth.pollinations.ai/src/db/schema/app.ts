import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const app = sqliteTable("app", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id")
        .references(() => user.id, {
            onDelete: "cascade",
            onUpdate: "cascade",
        })
        .notNull(),
    description: text("description").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$onUpdateFn(() => new Date())
        .notNull(),
});
