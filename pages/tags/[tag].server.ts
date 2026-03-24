import { defineHandler, defineHead } from "void"
import { getPostsByLang } from "../../src/utils/posts"
import type { Post } from "../../src/utils/posts"

export interface Props {
  tag: string
  posts: Post[]
}

export const loader = defineHandler<Props>((c) => {
  const tag = c.req.param("tag")
  if (!tag) return c.notFound()
  const posts = getPostsByLang("en").filter((p) => p.data.tags?.includes(tag))
  return { tag, posts }
})

export const head = defineHead<Props>((c, props) => ({
  title: `Tagged with "${props.tag}"`,
}))
