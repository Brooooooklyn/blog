import type { Lang } from "../consts"
import { UI_STRINGS, LOCALE_MAP } from "../consts"
import { getPostUrl, getReadingTime } from "../utils/posts"
import TagBadge from "./TagBadge"
import type { Post } from "../utils/posts"

export default function PostList({ posts, lang }: { posts: Post[]; lang: Lang }) {
  const t = UI_STRINGS[lang]
  return (
    <div className="space-y-10">
      {posts.map((post) => {
        const readingTime = getReadingTime(post.content)
        const date = new Date(post.data.date)
        return (
          <article key={post.data.postname}>
            <a href={getPostUrl(post, lang)} className="group block no-underline">
              <h3 className="text-lg font-medium text-neutral-900 transition-colors group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300">
                {post.data.title}
              </h3>
              <div className="mt-1.5 flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                <time dateTime={date.toISOString()}>
                  {date.toLocaleDateString(LOCALE_MAP[lang], { year: "numeric", month: "long", day: "numeric" })}
                </time>
                <span>&middot;</span>
                <span>{readingTime} {t.minRead}</span>
              </div>
            </a>
            {post.data.tags && post.data.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.data.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} lang={lang} />
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
