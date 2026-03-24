import { defineHandler, defineHead } from "void"
import { getPostsByLang } from "../src/utils/posts"
import type { Post } from "../src/utils/posts"

export interface Props {
  posts: Post[]
}

export const loader = defineHandler<Props>(() => {
  return { posts: getPostsByLang("en") }
})

export const head = defineHead(() => ({
  title: "All Posts",
}))
