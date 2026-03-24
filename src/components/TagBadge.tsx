import type { Lang } from "../consts"
import { langPrefix } from "../utils/posts"

export default function TagBadge({ tag, lang }: { tag: string; lang: Lang }) {
  return (
    <a
      href={`${langPrefix(lang)}/tags/${tag}`}
      className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-500 no-underline transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
    >
      {tag}
    </a>
  )
}
