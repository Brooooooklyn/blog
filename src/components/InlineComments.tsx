import { useState, useCallback, useRef, useEffect } from "react"
import type { Lang } from "../consts"
import type { AuthUser } from "void/auth"
import InlineCommentLayer from "./InlineCommentLayer"
import InlineCommentSidebar, { type InlineCommentThread, type CommentDraft } from "./InlineCommentSidebar"
import TextHighlighter from "./TextHighlighter"

function groupCommentsIntoThreads(rows: any[]): InlineCommentThread[] {
  const topLevel = rows.filter((r: any) => r.parent_id === null)
  const replies = rows.filter((r: any) => r.parent_id !== null)

  return topLevel.map((comment: any) => ({
    ...comment,
    replies: replies
      .filter((r: any) => r.parent_id === comment.id)
      .sort((a: any, b: any) => +new Date(a.created_at) - +new Date(b.created_at)),
  }))
}

export default function InlineComments({
  postname,
  lang,
  user,
  initialComments,
}: {
  postname: string
  lang: Lang
  user: AuthUser | null
  initialComments: any[]
}) {
  const proseRef = useRef<HTMLDivElement | null>(null)
  const [threads, setThreads] = useState<InlineCommentThread[]>(() => groupCommentsIntoThreads(initialComments))
  const [draft, setDraft] = useState<CommentDraft | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)

  // Find the .prose element on mount
  useEffect(() => {
    const el = document.querySelector(".prose") as HTMLDivElement | null
    if (el) proseRef.current = el
  }, [])

  const handleComment = useCallback((info: { blockIndex: number; startOffset: number; endOffset: number; selectedText: string }) => {
    setDraft({
      blockIndex: info.blockIndex,
      startOffset: info.startOffset,
      endOffset: info.endOffset,
      selectedText: info.selectedText,
    })
  }, [])

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/inline-comments?postname=${postname}&lang=${lang}`)
    if (res.ok) {
      const data = await res.json()
      setThreads(data.comments ?? [])
    }
    setDraft(null)
  }, [postname, lang])

  const handleHighlightClick = useCallback((threadId: number) => {
    setActiveThreadId(threadId)
  }, [])

  return (
    <>
      <InlineCommentLayer
        proseRef={proseRef}
        user={user}
        lang={lang}
        onComment={handleComment}
      />
      <TextHighlighter
        proseRef={proseRef}
        threads={threads}
        activeThreadId={activeThreadId}
        onHighlightClick={handleHighlightClick}
      />
      <InlineCommentSidebar
        threads={threads}
        draft={draft}
        user={user}
        lang={lang}
        postname={postname}
        activeThreadId={activeThreadId}
        onThreadClick={setActiveThreadId}
        onDraftCancel={() => setDraft(null)}
        onCommentCreated={refreshComments}
      />
    </>
  )
}
