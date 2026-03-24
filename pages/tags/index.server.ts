import { defineHandler, defineHead } from "void"
import { getAllTags } from "../../src/utils/posts"

export interface Props {
  tags: Array<[string, number]>
}

export const prerender = true

export const loader = defineHandler<Props>(() => {
  const tags = getAllTags("en")
  return { tags: [...tags.entries()].sort((a, b) => b[1] - a[1]) }
})

export const head = defineHead(() => ({ title: "Tags" }))
