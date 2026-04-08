import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { auth } from "void/client"
import type { Lang } from "../consts"
import { UI_STRINGS } from "../consts"
import type { AuthUser } from "void/auth"

interface SelectionInfo {
  blockIndex: number
  startOffset: number
  endOffset: number
  selectedText: string
  rect: DOMRect
}

function getSelectionInfo(proseEl: HTMLElement): SelectionInfo | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const range = sel.getRangeAt(0)
  if (!proseEl.contains(range.commonAncestorContainer)) return null

  const selectedText = sel.toString().trim()
  if (!selectedText) return null

  // Find the block element (direct child of .prose) containing the selection
  const children = Array.from(proseEl.children)
  let blockIndex = -1
  let blockEl: Element | null = null

  for (let i = 0; i < children.length; i++) {
    if (children[i].contains(range.startContainer) || children[i] === range.startContainer) {
      blockIndex = i
      blockEl = children[i]
      break
    }
  }

  if (blockIndex === -1 || !blockEl) return null

  // Compute character offsets relative to the block's textContent
  const treeWalker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let startOffset = 0
  let endOffset = 0
  let foundStart = false
  let foundEnd = false

  while (treeWalker.nextNode()) {
    const node = treeWalker.currentNode as Text
    if (node === range.startContainer) {
      startOffset = charCount + range.startOffset
      foundStart = true
    }
    if (node === range.endContainer) {
      endOffset = charCount + range.endOffset
      foundEnd = true
      break
    }
    charCount += node.length
  }

  if (!foundStart || !foundEnd) return null

  const rect = range.getBoundingClientRect()
  return { blockIndex, startOffset, endOffset, selectedText, rect }
}

export default function InlineCommentLayer({
  proseRef,
  user,
  lang,
  onComment,
}: {
  proseRef: React.RefObject<HTMLDivElement | null>
  user: AuthUser | null
  lang: Lang
  onComment: (info: { blockIndex: number; startOffset: number; endOffset: number; selectedText: string }) => void
}) {
  const t = UI_STRINGS[lang]
  const [popover, setPopover] = useState<{ x: number; y: number; info: SelectionInfo } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      if (!proseRef.current) return
      const info = getSelectionInfo(proseRef.current)
      if (info) {
        setPopover({
          x: info.rect.left + info.rect.width / 2,
          y: info.rect.top - 8,
          info,
        })
      } else {
        setPopover(null)
      }
    }, 10)
  }, [proseRef])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    },
    [],
  )

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("mousedown", handleMouseDown)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("mousedown", handleMouseDown)
    }
  }, [handleMouseUp, handleMouseDown])

  if (!popover) return null

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 -translate-x-1/2 pb-2"
      style={{ left: popover.x, top: popover.y - 4 }}
    >
      <div className="translate-y-[-100%]">
        <div className="rounded-full border border-white/40 bg-white/50 px-1 py-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-2xl backdrop-saturate-[180%] dark:border-white/[0.08] dark:bg-white/[0.06] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]">
          {user ? (
            <button
              onClick={() => {
                onComment({
                  blockIndex: popover.info.blockIndex,
                  startOffset: popover.info.startOffset,
                  endOffset: popover.info.endOffset,
                  selectedText: popover.info.selectedText,
                })
                setPopover(null)
                window.getSelection()?.removeAllRanges()
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {t.addComment}
            </button>
          ) : (
            <button
              onClick={() => auth.signIn.social({ provider: "github" })}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              {t.signInToAnnotate}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
