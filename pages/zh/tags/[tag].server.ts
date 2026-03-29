import { defineHandler, defineHead } from "void"
import { getPostsByLang, getReadingTime } from "../../../src/utils/posts"
import { notFoundResponse } from "../../../src/utils/error-page"
import type { PostSummary } from "../../index.server"

export interface Props {
  tag: string
  posts: PostSummary[]
}

export const loader = defineHandler<Props>((c) => {
  const tag = c.req.param("tag")
  if (!tag) return notFoundResponse()
  const filtered = getPostsByLang("zh").filter((p) => p.data.tags?.includes(tag))
  if (filtered.length === 0) return notFoundResponse()
  return { tag, posts: filtered.map((p) => ({ data: p.data, readingTime: getReadingTime(p.content) })) }
})

export const head = defineHead<Props>((c, props) => ({
  title: `标签: ${props.tag}`,
}))
