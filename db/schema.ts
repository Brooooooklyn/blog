import { sqliteTable, integer, text } from "void/schema-d1"

export const views = sqliteTable("views", {
  postname: text("postname").primaryKey(),
  count: integer("count").notNull().default(0),
})

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postname: text("postname").notNull(),
  github_user_id: text("github_user_id").notNull(),
  github_username: text("github_username").notNull(),
  github_avatar_url: text("github_avatar_url").notNull(),
  github_display_name: text("github_display_name").notNull(),
  body: text("body").notNull(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
})
