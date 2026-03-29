import { defineHandler, defineHead } from "void"
import { getAllTags } from "../../../src/utils/posts"

export interface Props {
  tags: Array<[string, number]>
}

export const loader = defineHandler<Props>(() => {
  const tags = getAllTags("zh")
  return { tags: [...tags.entries()].sort((a, b) => b[1] - a[1]) }
})

export const head = defineHead(() => ({ title: "标签" }))
