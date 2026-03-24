import { defineHandler } from "void"
import { db, eq, desc } from "void/db"
import { comments } from "@schema"
import { getUser } from "void/auth"

export const GET = defineHandler(async (c) => {
  const postname = c.req.query("postname")
  if (!postname) return c.json({ error: "Missing postname" }, 400)

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.postname, postname))
    .orderBy(desc(comments.created_at))

  return c.json(rows)
})

export const POST = defineHandler(async (c) => {
  const user = getUser()
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const { postname, body } = await c.req.json()
  if (!postname || !body?.trim()) return c.json({ error: "Missing fields" }, 400)

  await db.insert(comments).values({
    postname,
    github_user_id: user.id,
    github_username: user.name ?? "unknown",
    github_avatar_url: user.image ?? "",
    github_display_name: user.name ?? "Anonymous",
    body: body.trim(),
    created_at: new Date(),
  })

  return c.json({ ok: true })
})
