import { Link } from "@void/react"
import type { Props } from "./[postname].server"
import { UI_STRINGS, LOCALE_MAP } from "../src/consts"
import Bio from "../src/components/Bio"
import TagBadge from "../src/components/TagBadge"
import CommentSection from "../src/components/CommentSection" with { island: "load" }

export default function PostPage({
  postData,
  html,
  headings,
  readingTime,
  viewCount,
  comments,
  user,
  prevPost,
  nextPost,
}: Props) {
  const lang = "en" as const
  const t = UI_STRINGS[lang]

  return (
    <article>
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {postData.title}
        </h1>
        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
          <time dateTime={new Date(postData.date).toISOString()}>
            {new Date(postData.date).toLocaleDateString(LOCALE_MAP[lang], { year: "numeric", month: "long", day: "numeric" })}
          </time>
          <span>&middot;</span>
          <span>{readingTime} {t.minRead}</span>
          <span>&middot;</span>
          <span>{viewCount} {t.views}</span>
        </div>
        {postData.tags && postData.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {postData.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} lang={lang} />
            ))}
          </div>
        )}
      </header>

      {postData.header_img && (
        <img
          src={`/blog-images/${postData.postname.replace(/\/[^/]+$/, "")}/${postData.header_img}`}
          alt={postData.title}
          className="mb-10 w-full rounded-lg"
        />
      )}

      {headings.length > 0 && (
        <details className="toc mb-10 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {t.toc}
          </summary>
          <nav className="mt-3">
            <ul className="space-y-1.5 text-sm">
              {headings.map((h) => (
                <li key={h.slug} className={h.depth === 3 ? "ml-4" : ""}>
                  <a href={`#${h.slug}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      )}

      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

      <hr className="my-12 border-neutral-200 dark:border-neutral-800" />

      <Bio lang={lang} />

      <CommentSection postname={postData.postname} comments={comments} user={user} lang={lang} />

      <nav className="mt-12 flex justify-between gap-4">
        <div>
          {prevPost && (
            <Link href={prevPost.url} className="group block no-underline">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">&larr; {t.prevPost}</span>
              <p className="mt-1 text-sm text-neutral-600 transition-colors group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-100">
                {prevPost.title}
              </p>
            </Link>
          )}
        </div>
        <div className="text-right">
          {nextPost && (
            <Link href={nextPost.url} className="group block no-underline">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">{t.nextPost} &rarr;</span>
              <p className="mt-1 text-sm text-neutral-600 transition-colors group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-100">
                {nextPost.title}
              </p>
            </Link>
          )}
        </div>
      </nav>
    </article>
  )
}
