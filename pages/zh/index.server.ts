import { defineHandler, defineHead } from "void"
import { getPostsByLang, getReadingTime } from "../../src/utils/posts"
import { wantsMarkdown, postListToMarkdown, markdownResponse } from "../../src/utils/content-negotiation"
import type { PostData } from "../../src/utils/posts"

export interface PostSummary {
  data: PostData
  readingTime: number
}

export interface Props {
  posts: PostSummary[]
}

export const loader = defineHandler<Props>((c) => {
  const allPosts = getPostsByLang("zh")
  if (wantsMarkdown(c.req.header("accept"))) {
    return markdownResponse(postListToMarkdown(allPosts, "zh"))
  }
  const posts = allPosts.map((p) => ({
    data: p.data,
    readingTime: getReadingTime(p.content),
  }))
  return { posts }
})

export const head = defineHead(() => ({
  title: "所有文章",
}))
