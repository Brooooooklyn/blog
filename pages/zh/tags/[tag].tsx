import type { Props } from "./[tag].server"
import PostList from "../../../src/components/PostList"

export default function TagPage({ tag, posts }: Props) {
  return (
    <div>
      <div className="mb-10">
        <a href="/zh" className="text-sm text-neutral-400 no-underline transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
          &larr; 所有文章
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{tag}</h1>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">{posts.length} 篇文章</p>
      </div>
      <PostList posts={posts} lang="zh" />
    </div>
  )
}
