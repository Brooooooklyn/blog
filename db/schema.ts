import { sqliteTable, integer, text, blob } from "void/schema-d1"

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

export const postSnapshots = sqliteTable("post_snapshots", {
  postname: text("postname").primaryKey(),
  snapshot: blob("snapshot", { mode: "buffer" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const inlineComments = sqliteTable("inline_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postname: text("postname").notNull(),
  lang: text("lang").notNull().default("en"),
  block_index: integer("block_index").notNull(),
  start_offset: integer("start_offset").notNull(),
  end_offset: integer("end_offset").notNull(),
  selected_text: text("selected_text").notNull(),
  cursor_start: blob("cursor_start", { mode: "buffer" }),
  cursor_end: blob("cursor_end", { mode: "buffer" }),
  version_frontiers: blob("version_frontiers", { mode: "buffer" }),
  parent_id: integer("parent_id"),
  github_user_id: text("github_user_id").notNull(),
  github_username: text("github_username").notNull(),
  github_avatar_url: text("github_avatar_url").notNull(),
  github_display_name: text("github_display_name").notNull(),
  body: text("body").notNull(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
})
