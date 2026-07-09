import { defineHandler, defineHead } from "void"
import { db, sql, eq, desc, and } from "void/db"
import { views, comments, inlineComments } from "@schema"
import { getUser } from "void/auth"
import { getPostByName, getPostsByLang, getReadingTime } from "../../src/utils/posts"
import { getPrerenderedPost } from "../../src/utils/markdown"
import { bestEffortWrite, bestEffortRead } from "../../src/utils/best-effort"
import { notFoundResponse } from "../../src/utils/error-page"
import { wantsMarkdown, postToMarkdown, markdownResponse } from "../../src/utils/content-negotiation"
import type { PostData } from "../../src/utils/posts"
import type { AuthUser } from "void/auth"

type InlineCommentRow = typeof inlineComments.$inferSelect
type InlineCommentThread = InlineCommentRow & { replies: InlineCommentRow[] }

export interface Props {
  postData: PostData
  html: string
  headings: Array<{ depth: number; text: string; slug: string }>
  readingTime: number
  viewCount: number
  comments: (typeof comments.$inferSelect)[]
  inlineComments: InlineCommentThread[]
  user: AuthUser | null
  prevPost: { title: string; url: string } | null
  nextPost: { title: string; url: string } | null
}

function groupInlineComments(rows: InlineCommentRow[]): InlineCommentThread[] {
  const topLevel = rows.filter((r) => r.parent_id === null)
  const replies = rows.filter((r) => r.parent_id !== null)
  return topLevel.map((comment) => ({
    ...comment,
    replies: replies
      .filter((r) => r.parent_id === comment.id)
      .sort((a, b) => +a.created_at - +b.created_at),
  }))
}

export const loader = defineHandler<Props>(async (c) => {
  const postname = c.req.param("postname")
  if (!postname) return notFoundResponse()

  const post = getPostByName(postname, "zh")
  if (!post) return notFoundResponse()

  if (wantsMarkdown(c.req.header("accept"))) {
    return markdownResponse(postToMarkdown(post))
  }

  // All D1 access here is best-effort: the article renders from build artifacts,
  // so a transient D1 failure must degrade nonessential data, never 500 the page.
  const isClientNav = c.req.header("x-voidpages") === "true"
  if (!isClientNav) {
    await bestEffortWrite(`view increment (${postname})`, () =>
      db
        .insert(views)
        .values({ postname, count: 1 })
        .onConflictDoUpdate({ target: views.postname, set: { count: sql`${views.count} + 1` } }),
    )
  }

  const [[viewRow], postComments, postInlineComments] = await Promise.all([
    bestEffortRead(`views read (${postname})`, [] as { count: number }[], () =>
      db.select({ count: views.count }).from(views).where(eq(views.postname, postname)),
    ),
    bestEffortRead(`comments read (${postname})`, [] as (typeof comments.$inferSelect)[], () =>
      db.select().from(comments).where(eq(comments.postname, postname)).orderBy(desc(comments.created_at)),
    ),
    bestEffortRead(`inline comments read (${postname})`, [] as InlineCommentRow[], () =>
      db.select().from(inlineComments).where(and(eq(inlineComments.postname, postname), eq(inlineComments.lang, "zh"))).orderBy(desc(inlineComments.created_at)),
    ),
  ])
  const user = getUser()
  const prerendered = getPrerenderedPost(postname, "zh")
  const html = prerendered?.html ?? ""
  const headings = prerendered?.headings ?? []

  const posts = getPostsByLang("zh")
  const idx = posts.findIndex((p) => p.data.postname === postname)
  const prev = posts[idx + 1]
  const next = posts[idx - 1]

  return {
    postData: post.data,
    html,
    headings,
    readingTime: getReadingTime(post.content),
    viewCount: viewRow?.count ?? 0,
    comments: postComments,
    inlineComments: groupInlineComments(postInlineComments),
    user,
    prevPost: prev ? { title: prev.data.title, url: `/zh/${prev.data.postname}` } : null,
    nextPost: next ? { title: next.data.title, url: `/zh/${next.data.postname}` } : null,
  }
})

export const head = defineHead<Props>((c, props) => {
  const desc = props.postData.description ?? props.postData.title
  const meta: Array<Record<string, string>> = [
    { name: "description", content: desc },
    { property: "og:title", content: props.postData.title },
    { property: "og:description", content: desc },
    { property: "og:type", content: "article" },
    { property: "twitter:card", content: "summary_large_image" },
    { property: "twitter:title", content: props.postData.title },
    { property: "twitter:description", content: desc },
  ]
  if (props.postData.header_img) {
    const ogUrl = `https://lyn.one/blog-images/${props.postData.slug}/${props.postData.header_img}`
    meta.push({ property: "og:image", content: ogUrl })
    meta.push({ property: "twitter:image", content: ogUrl })
  }
  return { title: props.postData.title, meta }
})
