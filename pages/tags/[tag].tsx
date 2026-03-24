import type { Props } from "./[tag].server"
import PostList from "../../src/components/PostList"

export default function TagPage({ tag, posts }: Props) {
  return (
    <div>
      <div className="mb-10">
        <a href="/" className="text-sm text-neutral-400 no-underline transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
          &larr; All posts
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{tag}</h1>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">{posts.length} posts tagged</p>
      </div>
      <PostList posts={posts} lang="en" />
    </div>
  )
}
