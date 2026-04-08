import { useState, useMemo } from "react"
import { auth } from "void/client"
import { marked } from "marked"
import type { Lang } from "../consts"
import { UI_STRINGS, LOCALE_MAP } from "../consts"
import type { AuthUser } from "void/auth"

export interface InlineCommentThread {
  id: number
  block_index: number
  start_offset: number
  end_offset: number
  selected_text: string
  github_username: string
  github_avatar_url: string
  github_display_name: string
  body: string
  created_at: string | number
  replies: Array<{
    id: number
    github_username: string
    github_avatar_url: string
    github_display_name: string
    body: string
    created_at: string | number
  }>
}

export interface CommentDraft {
  blockIndex: number
  startOffset: number
  endOffset: number
  selectedText: string
  topOffset: number
}

export default function InlineCommentSidebar({
  threads,
  draft,
  user,
  lang,
  postname,
  activeThreadId,
  onThreadClick,
  onDraftCancel,
  onCommentCreated,
}: {
  threads: InlineCommentThread[]
  draft: CommentDraft | null
  user: AuthUser | null
  lang: Lang
  postname: string
  activeThreadId: number | null
  onThreadClick: (id: number) => void
  onDraftCancel: () => void
  onCommentCreated: () => void
}) {
  return (
    <aside className="absolute top-0 left-full ml-6 hidden w-[280px] xl:block">
      {draft && user && (
        <div className="absolute w-full" style={{ top: draft.topOffset }}>
          <CommentForm
            user={user}
            lang={lang}
            postname={postname}
            draft={draft}
            onCancel={onDraftCancel}
            onCreated={onCommentCreated}
          />
        </div>
      )}
      <div className="sticky top-8 space-y-3">
        {threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            lang={lang}
            postname={postname}
            user={user}
            isActive={activeThreadId === thread.id}
            onClick={() => onThreadClick(thread.id)}
            onReplyCreated={onCommentCreated}
          />
        ))}
      </div>
    </aside>
  )
}

function CommentForm({
  user,
  lang,
  postname,
  draft,
  onCancel,
  onCreated,
}: {
  user: AuthUser
  lang: Lang
  postname: string
  draft: CommentDraft
  onCancel: () => void
  onCreated: () => void
}) {
  const t = UI_STRINGS[lang]
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/inline-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postname,
          lang,
          block_index: draft.blockIndex,
          start_offset: draft.startOffset,
          end_offset: draft.endOffset,
          selected_text: draft.selectedText,
          body: body.trim(),
        }),
      })
      if (res.ok) {
        setBody("")
        onCreated()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-2xl backdrop-saturate-[180%] dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="px-4 pt-4 pb-3">
        <p className="truncate text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          <span className="text-neutral-300 dark:text-neutral-600">&ldquo;</span>
          {draft.selectedText}
          <span className="text-neutral-300 dark:text-neutral-600">&rdquo;</span>
        </p>
      </div>
      <div className="border-t border-white/30 px-4 pt-3 pb-4 dark:border-white/[0.06]">
        <div className="flex items-start gap-3">
          <img src={user.image ?? ""} alt="" className="mt-1 h-8 w-8 rounded-full shadow-sm ring-2 ring-white/60 dark:ring-white/10" />
          <form onSubmit={handleSubmit} className="flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t.addComment}
              rows={3}
              ref={(el) => el?.focus({ preventScroll: true })}
              className="w-full resize-none rounded-xl border border-white/50 bg-white/50 px-3 py-2.5 text-[13px] leading-relaxed text-neutral-900 placeholder-neutral-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition-all focus:border-white/70 focus:bg-white/70 focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_rgba(255,255,255,0.3)] focus:outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-100 dark:placeholder-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="rounded-xl bg-white/60 px-4 py-1.5 text-[13px] font-semibold text-neutral-800 shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] disabled:opacity-30 dark:bg-white/10 dark:text-neutral-200 dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-white/15"
              >
                {submitting ? "..." : t.submitComment}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function ThreadCard({
  thread,
  lang,
  postname,
  user,
  isActive,
  onClick,
  onReplyCreated,
}: {
  thread: InlineCommentThread
  lang: Lang
  postname: string
  user: AuthUser | null
  isActive: boolean
  onClick: () => void
  onReplyCreated: () => void
}) {
  const t = UI_STRINGS[lang]
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyBody.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/inline-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postname,
          lang,
          block_index: thread.block_index,
          start_offset: thread.start_offset,
          end_offset: thread.end_offset,
          selected_text: thread.selected_text,
          parent_id: thread.id,
          body: replyBody.trim(),
        }),
      })
      if (res.ok) {
        setReplyBody("")
        setShowReplyForm(false)
        onReplyCreated()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer overflow-hidden rounded-2xl border backdrop-blur-2xl backdrop-saturate-[180%] transition-all ${
        isActive
          ? "border-white/40 bg-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-white/20 bg-white/15 hover:border-white/40 hover:bg-white/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.4)] dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.04]"
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <p className="truncate text-[12px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          <span className="text-neutral-300 dark:text-neutral-600">&ldquo;</span>
          {thread.selected_text}
          <span className="text-neutral-300 dark:text-neutral-600">&rdquo;</span>
        </p>
      </div>

      <div className="px-4 pb-3.5">
        <CommentEntry
          displayName={thread.github_display_name}
          avatarUrl={thread.github_avatar_url}
          body={thread.body}
          createdAt={thread.created_at}
          lang={lang}
        />

        {thread.replies.map((reply) => (
          <div key={reply.id} className="mt-3 border-l-2 border-neutral-100 pl-3 dark:border-neutral-800">
            <CommentEntry
              displayName={reply.github_display_name}
              avatarUrl={reply.github_avatar_url}
              body={reply.body}
              createdAt={reply.created_at}
              lang={lang}
            />
          </div>
        ))}

        {user && !showReplyForm && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowReplyForm(true)
            }}
            className="mt-3 flex items-center gap-1 text-[12px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            {t.reply}
          </button>
        )}

        {showReplyForm && user && (
          <form onSubmit={handleReply} className="mt-3 border-t border-white/20 pt-3 dark:border-white/[0.04]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <img src={user.image ?? ""} alt="" className="mt-1 h-5 w-5 rounded-full ring-1 ring-white/40 dark:ring-white/10" />
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={2}
                autoFocus
                placeholder={t.reply + "..."}
                className="flex-1 resize-none rounded-lg border border-white/40 bg-white/40 px-2.5 py-2 text-[13px] leading-relaxed text-neutral-900 placeholder-neutral-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition-all focus:border-white/60 focus:bg-white/60 focus:outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-100 dark:placeholder-neutral-600 dark:focus:border-white/15"
              />
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setShowReplyForm(false)}
                className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !replyBody.trim()}
                className="rounded-lg bg-white/50 px-3 py-1 text-[12px] font-semibold text-neutral-700 shadow-[0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm transition-all hover:bg-white/70 disabled:opacity-30 dark:bg-white/10 dark:text-neutral-300 dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-white/15"
              >
                {t.reply}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function CommentBody({ body }: { body: string }) {
  const html = useMemo(() => {
    const rendered = marked.parseInline(body) as string
    return rendered
  }, [body])

  return (
    <div
      className="comment-body mt-0.5 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300 [&_a]:text-blue-600 [&_a]:underline [&_a]:decoration-blue-300 dark:[&_a]:text-blue-400 dark:[&_a]:decoration-blue-700 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] dark:[&_code]:bg-neutral-800 [&_strong]:font-semibold [&_strong]:text-neutral-900 dark:[&_strong]:text-neutral-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function CommentEntry({
  displayName,
  avatarUrl,
  body,
  createdAt,
  lang,
}: {
  displayName: string
  avatarUrl: string
  body: string
  createdAt: string | number
  lang: Lang
}) {
  return (
    <div className="flex items-start gap-2.5">
      <img src={avatarUrl} alt={displayName} className="mt-0.5 h-6 w-6 rounded-full ring-1 ring-neutral-100 dark:ring-neutral-800" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{displayName}</span>
          <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
            {new Date(createdAt).toLocaleDateString(LOCALE_MAP[lang], { month: "short", day: "numeric" })}
          </span>
        </div>
        <CommentBody body={body} />
      </div>
    </div>
  )
}
