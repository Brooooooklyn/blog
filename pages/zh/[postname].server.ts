import { defineHandler, defineHead } from "void"
import { db, sql, eq, desc } from "void/db"
import { views, comments } from "@schema"
import { getUser } from "void/auth"
import { getPostByName, getPostsByLang, getReadingTime } from "../../src/utils/posts"
import { renderMarkdown, extractHeadings } from "../../src/utils/markdown"
import type { PostData } from "../../src/utils/posts"
import type { AuthUser } from "void/auth"

export interface Props {
  postData: PostData
  html: string
  headings: Array<{ depth: number; text: string; slug: string }>
  readingTime: number
  viewCount: number
  comments: any[]
  user: AuthUser | null
  prevPost: { title: string; url: string } | null
  nextPost: { title: string; url: string } | null
}

export const loader = defineHandler<Props>(async (c) => {
  const postname = c.req.param("postname")
  if (!postname) return c.notFound()

  const post = getPostByName(postname, "zh")
  if (!post) return c.notFound()

  await db
    .insert(views)
    .values({ postname, count: 1 })
    .onConflictDoUpdate({ target: views.postname, set: { count: sql`${views.count} + 1` } })

  const [viewRow] = await db.select({ count: views.count }).from(views).where(eq(views.postname, postname))
  const postComments = await db.select().from(comments).where(eq(comments.postname, postname)).orderBy(desc(comments.created_at))
  const user = getUser()
  const html = await renderMarkdown(post.content)
  const headings = extractHeadings(post.content)

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
    user,
    prevPost: prev ? { title: prev.data.title, url: `/zh/${prev.data.postname}` } : null,
    nextPost: next ? { title: next.data.title, url: `/zh/${next.data.postname}` } : null,
  }
})

export const head = defineHead<Props>((c, props) => ({
  title: props.postData.title,
}))
