import { useState } from "react"
import { auth } from "void/client"
import type { Lang } from "../consts"
import { UI_STRINGS, LOCALE_MAP } from "../consts"
import type { AuthUser } from "void/auth"

interface Comment {
  id: number
  postname: string
  github_username: string
  github_avatar_url: string
  github_display_name: string
  body: string
  created_at: string | number
}

export default function CommentSection({
  postname,
  comments: initialComments,
  user,
  lang,
}: {
  postname: string
  comments: Comment[]
  user: AuthUser | null
  lang: Lang
}) {
  const t = UI_STRINGS[lang]
  const [comments, setComments] = useState(initialComments)
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postname, body: body.trim() }),
      })
      if (res.ok) {
        const newComment: Comment = {
          id: Date.now(),
          postname,
          github_username: user?.name ?? "unknown",
          github_avatar_url: user?.image ?? "",
          github_display_name: user?.name ?? "Anonymous",
          body: body.trim(),
          created_at: new Date().toISOString(),
        }
        setComments([newComment, ...comments])
        setBody("")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-12" id="comments">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {t.comments} ({comments.length})
      </h2>

      <div className="mt-6">
        {user ? (
          <div className="flex items-start gap-3">
            <img src={user.image ?? ""} alt={user.name ?? ""} className="h-8 w-8 rounded-full" />
            <form onSubmit={handleSubmit} className="flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t.leaveComment}
                required
                rows={3}
                className="w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {submitting ? "..." : t.submitComment}
              </button>
            </form>
          </div>
        ) : (
          <button
            onClick={() => auth.signIn.social({ provider: "github" })}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
            {t.signInToComment}
          </button>
        )}
      </div>

      <div className="mt-8 space-y-6" id="comment-list">
        {comments.map((comment) => (
          <div key={comment.id} className="flex items-start gap-3">
            <img src={comment.github_avatar_url} alt={comment.github_display_name} className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{comment.github_display_name}</span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">@{comment.github_username}</span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  &middot; {new Date(comment.created_at).toLocaleDateString(LOCALE_MAP[lang], { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{comment.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
