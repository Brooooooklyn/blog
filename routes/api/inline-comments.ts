import { defineHandler } from "void"
import { db, eq, and, desc } from "void/db"
import { inlineComments } from "@schema"
import { getUser } from "void/auth"

function groupCommentsWithReplies(rows: any[]) {
  const topLevel = rows.filter((r: any) => r.parent_id === null)
  const replies = rows.filter((r: any) => r.parent_id !== null)

  return topLevel.map((comment: any) => ({
    ...comment,
    cursor_start: comment.cursor_start ? bufferToBase64(comment.cursor_start) : null,
    cursor_end: comment.cursor_end ? bufferToBase64(comment.cursor_end) : null,
    version_frontiers: comment.version_frontiers ? bufferToBase64(comment.version_frontiers) : null,
    replies: replies
      .filter((r: any) => r.parent_id === comment.id)
      .sort((a: any, b: any) => +a.created_at - +b.created_at)
      .map((r: any) => ({
        ...r,
        cursor_start: undefined,
        cursor_end: undefined,
        version_frontiers: undefined,
      })),
  }))
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64")
}

export const GET = defineHandler(async (c) => {
  const postname = c.req.query("postname")
  const lang = c.req.query("lang") ?? "en"
  if (!postname) return c.json({ error: "Missing postname" }, 400)

  const rows = await db
    .select()
    .from(inlineComments)
    .where(and(eq(inlineComments.postname, postname), eq(inlineComments.lang, lang)))
    .orderBy(desc(inlineComments.created_at))

  return c.json({ comments: groupCommentsWithReplies(rows) })
})

export const POST = defineHandler(async (c) => {
  const user = getUser()
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const body = await c.req.json()
  const { postname, lang, block_index, start_offset, end_offset, selected_text, cursor_start, cursor_end, version_frontiers, parent_id, body: commentBody } = body

  if (!postname || !commentBody?.trim() || block_index === undefined || start_offset === undefined || end_offset === undefined || !selected_text) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  const [inserted] = await db
    .insert(inlineComments)
    .values({
      postname,
      lang: lang ?? "en",
      block_index,
      start_offset,
      end_offset,
      selected_text,
      cursor_start: cursor_start ? base64ToBuffer(cursor_start) : null,
      cursor_end: cursor_end ? base64ToBuffer(cursor_end) : null,
      version_frontiers: version_frontiers ? base64ToBuffer(version_frontiers) : null,
      parent_id: parent_id ?? null,
      github_user_id: user.id,
      github_username: user.name ?? "unknown",
      github_avatar_url: user.image ?? "",
      github_display_name: user.name ?? "Anonymous",
      body: commentBody.trim(),
      created_at: new Date(),
    })
    .returning()

  return c.json({ ok: true, id: inserted.id })
})

export const DELETE = defineHandler(async (c) => {
  const user = getUser()
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const id = Number(c.req.query("id"))
  if (!id) return c.json({ error: "Missing id" }, 400)

  const [comment] = await db.select().from(inlineComments).where(eq(inlineComments.id, id))
  if (!comment) return c.json({ error: "Not found" }, 404)
  if (comment.github_user_id !== user.id) return c.json({ error: "Forbidden" }, 403)

  await db.delete(inlineComments).where(eq(inlineComments.id, id))
  return c.json({ ok: true })
})
