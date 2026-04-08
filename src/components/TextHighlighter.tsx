import { useEffect, useRef, useCallback } from "react"
import type { InlineCommentThread } from "./InlineCommentSidebar"

export default function TextHighlighter({
  proseRef,
  threads,
  activeThreadId,
  onHighlightClick,
}: {
  proseRef: React.RefObject<HTMLDivElement | null>
  threads: InlineCommentThread[]
  activeThreadId: number | null
  onHighlightClick: (threadId: number) => void
}) {
  const highlightsRef = useRef<HTMLElement[]>([])

  const clearHighlights = useCallback(() => {
    for (const el of highlightsRef.current) {
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
      }
    }
    highlightsRef.current = []
  }, [])

  const applyHighlights = useCallback(() => {
    clearHighlights()

    if (!proseRef.current || threads.length === 0) return

    const prose = proseRef.current
    const children = Array.from(prose.children)

    for (const thread of threads) {
      const blockEl = children[thread.block_index]
      if (!blockEl) continue

      const range = createRangeFromOffsets(blockEl, thread.start_offset, thread.end_offset)
      if (!range) continue

      try {
        const mark = document.createElement("mark")
        mark.className =
          thread.id === activeThreadId
            ? "bg-amber-200/80 dark:bg-amber-500/30 cursor-pointer rounded-sm transition-colors"
            : "bg-amber-100/60 dark:bg-amber-500/20 cursor-pointer rounded-sm transition-colors hover:bg-amber-200/80 dark:hover:bg-amber-500/30"
        mark.dataset.threadId = String(thread.id)
        mark.addEventListener("click", () => onHighlightClick(thread.id))
        range.surroundContents(mark)
        highlightsRef.current.push(mark)
      } catch {
        // surroundContents can fail if selection spans multiple elements
      }
    }
  }, [proseRef, threads, activeThreadId, onHighlightClick, clearHighlights])

  useEffect(() => {
    applyHighlights()
    return clearHighlights
  }, [applyHighlights, clearHighlights])

  return null
}

function createRangeFromOffsets(blockEl: Element, startOffset: number, endOffset: number): Range | null {
  const treeWalker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let startNode: Text | null = null
  let startNodeOffset = 0
  let endNode: Text | null = null
  let endNodeOffset = 0

  while (treeWalker.nextNode()) {
    const node = treeWalker.currentNode as Text
    const nodeEnd = charCount + node.length

    if (!startNode && startOffset < nodeEnd) {
      startNode = node
      startNodeOffset = startOffset - charCount
    }
    if (!endNode && endOffset <= nodeEnd) {
      endNode = node
      endNodeOffset = endOffset - charCount
      break
    }
    charCount += node.length
  }

  if (!startNode || !endNode) return null

  const range = document.createRange()
  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)
  return range
}
