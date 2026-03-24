import { defineHandler, defineHead } from "void"
import { getPostsByLang } from "../../src/utils/posts"
import type { Post } from "../../src/utils/posts"

export interface Props {
  posts: Post[]
}

export const loader = defineHandler<Props>(() => {
  return { posts: getPostsByLang("zh") }
})

export const head = defineHead(() => ({
  title: "所有文章",
}))
