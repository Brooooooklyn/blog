import { defineHandler } from "void"
import postHistory from "virtual:post-history"

export const GET = defineHandler(async (c) => {
  const postname = c.req.query("postname")
  const lang = c.req.query("lang") ?? "en"
  if (!postname) return c.json({ error: "Missing postname" }, 400)

  const key = `${lang}/${postname}`
  const history = (postHistory as Record<string, any>)[key]

  if (!history) return c.json({ versions: [], blocks: [] })

  return c.json(history)
})
