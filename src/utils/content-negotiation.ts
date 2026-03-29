import type { Post, PostData } from "./posts"

const SITE = "https://lyn.one"

export function wantsMarkdown(accept: string | undefined): boolean {
  if (!accept) return false
  return accept.includes("text/markdown")
}

export function postToMarkdown(post: Post): string {
  const { title, date, tags, author, description } = post.data
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push("")
  const meta: string[] = []
  if (author) meta.push(`Author: ${author}`)
  meta.push(`Date: ${new Date(date).toISOString().slice(0, 10)}`)
  if (tags?.length) meta.push(`Tags: ${tags.join(", ")}`)
  if (description) meta.push(`Description: ${description}`)
  meta.push(`URL: ${SITE}/${post.data.postname}`)
  lines.push(meta.join(" | "))
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(post.content.trim())
  return lines.join("\n")
}

export function postListToMarkdown(posts: Array<{ data: PostData }>, lang: string): string {
  const prefix = lang === "en" ? "" : `/${lang}`
  const lines: string[] = []
  lines.push(`# Moonglade — ${lang === "en" ? "All Posts" : "所有文章"}`)
  lines.push("")
  for (const p of posts) {
    const date = new Date(p.data.date).toISOString().slice(0, 10)
    lines.push(`- [${p.data.title}](${SITE}${prefix}/${p.data.postname}) — ${date}`)
  }
  return lines.join("\n")
}

export function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  })
}
