import type { Props } from "./index.server"

export default function TagsPage({ tags }: Props) {
  return (
    <>
      <h1 className="mb-10 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">标签</h1>
      <div className="flex flex-wrap gap-2">
        {tags.map(([tag, count]) => (
          <a
            key={tag}
            href={`/zh/tags/${tag}`}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600 no-underline transition-colors hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
          >
            {tag} <span className="text-neutral-400 dark:text-neutral-500">({count})</span>
          </a>
        ))}
      </div>
    </>
  )
}
