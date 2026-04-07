import { useState } from "react"
import { auth } from "void/client"
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
  const t = UI_STRINGS[lang]

  return (
    <aside className="hidden w-[300px] shrink-0 xl:block">
      <div className="sticky top-8 space-y-4">
        {draft && user && (
          <CommentForm
            user={user}
            lang={lang}
            postname={postname}
            draft={draft}
            onCancel={onDraftCancel}
            onCreated={onCommentCreated}
          />
        )}
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
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
      <p className="mb-2 line-clamp-2 border-l-2 border-amber-300 pl-2 text-xs italic text-neutral-500 dark:border-amber-500/50 dark:text-neutral-400">
        &ldquo;{draft.selectedText}&rdquo;
      </p>
      <div className="flex items-start gap-2">
        <img src={user.image ?? ""} alt="" className="h-6 w-6 rounded-full" />
        <form onSubmit={handleSubmit} className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.addComment}
            rows={2}
            autoFocus
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-500"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="rounded bg-neutral-900 px-2.5 py-0.5 text-xs text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {submitting ? "..." : t.submitComment}
            </button>
          </div>
        </form>
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
      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
        isActive
          ? "border-amber-300 bg-amber-50/50 dark:border-amber-500/40 dark:bg-amber-500/5"
          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
      }`}
    >
      <p className="mb-2 line-clamp-2 border-l-2 border-amber-300 pl-2 text-xs italic text-neutral-500 dark:border-amber-500/50 dark:text-neutral-400">
        &ldquo;{thread.selected_text}&rdquo;
      </p>

      <CommentEntry
        username={thread.github_username}
        displayName={thread.github_display_name}
        avatarUrl={thread.github_avatar_url}
        body={thread.body}
        createdAt={thread.created_at}
        lang={lang}
      />

      {thread.replies.map((reply) => (
        <div key={reply.id} className="ml-6 mt-2 border-l border-neutral-100 pl-2 dark:border-neutral-800">
          <CommentEntry
            username={reply.github_username}
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
          className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {t.reply}
        </button>
      )}

      {showReplyForm && user && (
        <form onSubmit={handleReply} className="mt-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-1.5">
            <img src={user.image ?? ""} alt="" className="h-5 w-5 rounded-full" />
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              autoFocus
              className="flex-1 rounded border border-neutral-200 bg-transparent px-2 py-1 text-xs text-neutral-900 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:focus:border-neutral-500"
            />
          </div>
          <div className="mt-1 flex justify-end gap-1">
            <button type="button" onClick={() => setShowReplyForm(false)} className="rounded px-1.5 py-0.5 text-xs text-neutral-400">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !replyBody.trim()}
              className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {t.reply}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function CommentEntry({
  username,
  displayName,
  avatarUrl,
  body,
  createdAt,
  lang,
}: {
  username: string
  displayName: string
  avatarUrl: string
  body: string
  createdAt: string | number
  lang: Lang
}) {
  return (
    <div className="flex items-start gap-2">
      <img src={avatarUrl} alt={displayName} className="h-5 w-5 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">{displayName}</span>
          <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
            {new Date(createdAt).toLocaleDateString(LOCALE_MAP[lang], { month: "short", day: "numeric" })}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-700 dark:text-neutral-300">{body}</p>
      </div>
    </div>
  )
}
