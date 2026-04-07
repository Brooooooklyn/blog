import { defineHandler, defineHead } from "void"
import { db, sql, eq, desc, and } from "void/db"
import { views, comments, inlineComments } from "@schema"
import { getUser } from "void/auth"
import { getPostByName, getPostsByLang, getReadingTime } from "../src/utils/posts"
import { getPrerenderedPost } from "../src/utils/markdown"
import { notFoundResponse } from "../src/utils/error-page"
import { wantsMarkdown, postToMarkdown, markdownResponse } from "../src/utils/content-negotiation"
import type { PostData } from "../src/utils/posts"
import type { AuthUser } from "void/auth"

export interface Props {
  postData: PostData
  html: string
  headings: Array<{ depth: number; text: string; slug: string }>
  readingTime: number
  viewCount: number
  comments: any[]
  inlineComments: any[]
  user: AuthUser | null
  prevPost: { title: string; url: string } | null
  nextPost: { title: string; url: string } | null
}

export const loader = defineHandler<Props>(async (c) => {
  const postname = c.req.param("postname")
  if (!postname) return notFoundResponse()

  const post = getPostByName(postname, "en")
  if (!post) return notFoundResponse()

  if (wantsMarkdown(c.req.header("accept"))) {
    return markdownResponse(postToMarkdown(post))
  }

  // Increment view count only on initial page load (not client-side navigation)
  const isClientNav = c.req.header("x-voidpages") === "true"
  if (!isClientNav) {
    await db
      .insert(views)
      .values({ postname, count: 1 })
      .onConflictDoUpdate({ target: views.postname, set: { count: sql`${views.count} + 1` } })
  }

  const [viewRow] = await db.select({ count: views.count }).from(views).where(eq(views.postname, postname))
  const postComments = await db.select().from(comments).where(eq(comments.postname, postname)).orderBy(desc(comments.created_at))
  const postInlineComments = await db
    .select()
    .from(inlineComments)
    .where(and(eq(inlineComments.postname, postname), eq(inlineComments.lang, "en")))
    .orderBy(desc(inlineComments.created_at))
  const user = getUser()
  const prerendered = getPrerenderedPost(postname, "en")
  const html = prerendered?.html ?? ""
  const headings = prerendered?.headings ?? []

  // Find prev/next
  const posts = getPostsByLang("en")
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
    inlineComments: postInlineComments,
    user,
    prevPost: prev ? { title: prev.data.title, url: `/${prev.data.postname}` } : null,
    nextPost: next ? { title: next.data.title, url: `/${next.data.postname}` } : null,
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
