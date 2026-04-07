# Inline Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Notion-style inline comments where users select text, click "Comment", and leave comments anchored to specific text ranges, displayed in a right sidebar.

**Architecture:** D1 stores inline comments with block index + character offsets + Loro cursor data. The version-history Vite plugin is enhanced to export base64 LoroDoc snapshots in the virtual module. Client-side islands handle text selection, highlight rendering, and sidebar display. Loro WASM runs client-side only for cursor creation/resolution.

**Tech Stack:** React 19, Tailwind CSS 4.2, D1/Drizzle ORM, Loro CRDT (client-side WASM), Void framework islands

---

### Task 1: D1 Schema — `inline_comments` table

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0002_inline_comments.sql`
- Modify: `db/migrations/meta/_journal.json`

- [ ] **Step 1: Add Drizzle schema**

In `db/schema.ts`, add after the `postSnapshots` table:

```typescript
export const inlineComments = sqliteTable("inline_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postname: text("postname").notNull(),
  lang: text("lang").notNull().default("en"),
  block_index: integer("block_index").notNull(),
  start_offset: integer("start_offset").notNull(),
  end_offset: integer("end_offset").notNull(),
  selected_text: text("selected_text").notNull(),
  cursor_start: blob("cursor_start", { mode: "buffer" }),
  cursor_end: blob("cursor_end", { mode: "buffer" }),
  version_frontiers: blob("version_frontiers", { mode: "buffer" }),
  parent_id: integer("parent_id"),
  github_user_id: text("github_user_id").notNull(),
  github_username: text("github_username").notNull(),
  github_avatar_url: text("github_avatar_url").notNull(),
  github_display_name: text("github_display_name").notNull(),
  body: text("body").notNull(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

- [ ] **Step 2: Create migration file**

Create `db/migrations/0002_inline_comments.sql`:

```sql
CREATE TABLE `inline_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postname` text NOT NULL,
	`lang` text NOT NULL DEFAULT 'en',
	`block_index` integer NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`selected_text` text NOT NULL,
	`cursor_start` blob,
	`cursor_end` blob,
	`version_frontiers` blob,
	`parent_id` integer,
	`github_user_id` text NOT NULL,
	`github_username` text NOT NULL,
	`github_avatar_url` text NOT NULL,
	`github_display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
```

- [ ] **Step 3: Update migration journal**

In `db/migrations/meta/_journal.json`, add a third entry to the `entries` array:

```json
{
  "idx": 2,
  "version": "6",
  "when": 1774337811810,
  "tag": "0002_inline_comments",
  "breakpoints": true
}
```

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations/0002_inline_comments.sql db/migrations/meta/_journal.json
git commit -m "feat: add inline_comments D1 table schema and migration"
```

---

### Task 2: Inline Comments API — CRUD endpoint

**Files:**
- Create: `routes/api/inline-comments.ts`
- Create: `plugins/__tests__/inline-comments-api.test.ts`

- [ ] **Step 1: Write API tests**

Create `plugins/__tests__/inline-comments-api.test.ts`. These test the data transformation logic (grouping comments with replies) since we can't easily test the Void handler in vitest:

```typescript
import { describe, it, expect } from "vitest"

interface InlineComment {
  id: number
  postname: string
  lang: string
  block_index: number
  start_offset: number
  end_offset: number
  selected_text: string
  cursor_start: null | string
  cursor_end: null | string
  version_frontiers: null | string
  parent_id: number | null
  github_user_id: string
  github_username: string
  github_avatar_url: string
  github_display_name: string
  body: string
  created_at: number
}

function groupCommentsWithReplies(rows: InlineComment[]) {
  const topLevel = rows.filter((r) => r.parent_id === null)
  const replies = rows.filter((r) => r.parent_id !== null)

  return topLevel.map((comment) => ({
    ...comment,
    replies: replies
      .filter((r) => r.parent_id === comment.id)
      .sort((a, b) => a.created_at - b.created_at),
  }))
}

describe("groupCommentsWithReplies", () => {
  const base = {
    postname: "test",
    lang: "en",
    block_index: 0,
    start_offset: 0,
    end_offset: 10,
    selected_text: "hello",
    cursor_start: null,
    cursor_end: null,
    version_frontiers: null,
    github_user_id: "1",
    github_username: "user",
    github_avatar_url: "https://example.com/avatar.jpg",
    github_display_name: "User",
  }

  it("groups top-level comments with no replies", () => {
    const rows: InlineComment[] = [
      { ...base, id: 1, parent_id: null, body: "first", created_at: 1000 },
      { ...base, id: 2, parent_id: null, body: "second", created_at: 2000 },
    ]
    const result = groupCommentsWithReplies(rows)
    expect(result).toHaveLength(2)
    expect(result[0].replies).toHaveLength(0)
    expect(result[1].replies).toHaveLength(0)
  })

  it("nests replies under parent", () => {
    const rows: InlineComment[] = [
      { ...base, id: 1, parent_id: null, body: "parent", created_at: 1000 },
      { ...base, id: 2, parent_id: 1, body: "reply1", created_at: 2000 },
      { ...base, id: 3, parent_id: 1, body: "reply2", created_at: 3000 },
    ]
    const result = groupCommentsWithReplies(rows)
    expect(result).toHaveLength(1)
    expect(result[0].replies).toHaveLength(2)
    expect(result[0].replies[0].body).toBe("reply1")
    expect(result[0].replies[1].body).toBe("reply2")
  })

  it("sorts replies by created_at ascending", () => {
    const rows: InlineComment[] = [
      { ...base, id: 1, parent_id: null, body: "parent", created_at: 1000 },
      { ...base, id: 3, parent_id: 1, body: "late", created_at: 5000 },
      { ...base, id: 2, parent_id: 1, body: "early", created_at: 2000 },
    ]
    const result = groupCommentsWithReplies(rows)
    expect(result[0].replies[0].body).toBe("early")
    expect(result[0].replies[1].body).toBe("late")
  })

  it("handles empty input", () => {
    expect(groupCommentsWithReplies([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run plugins/__tests__/inline-comments-api.test.ts`
Expected: 4 tests PASS

- [ ] **Step 3: Create API endpoint**

Create `routes/api/inline-comments.ts`:

```typescript
import { defineHandler } from "void"
import { db, eq, and, desc } from "void/db"
import { inlineComments } from "@schema"
import { getUser } from "void/auth"

function groupCommentsWithReplies(rows: any[]) {
  const topLevel = rows.filter((r: any) => r.parent_id === null)
  const replies = rows.filter((r: any) => r.parent_id !== null)

  return topLevel.map((comment: any) => ({
    ...comment,
    cursor_start: comment.cursor_start ? bufferToBase64(comment.cursor_start) : null,
    cursor_end: comment.cursor_end ? bufferToBase64(comment.cursor_end) : null,
    version_frontiers: comment.version_frontiers ? bufferToBase64(comment.version_frontiers) : null,
    replies: replies
      .filter((r: any) => r.parent_id === comment.id)
      .sort((a: any, b: any) => +a.created_at - +b.created_at)
      .map((r: any) => ({
        ...r,
        cursor_start: undefined,
        cursor_end: undefined,
        version_frontiers: undefined,
      })),
  }))
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64")
}

export const GET = defineHandler(async (c) => {
  const postname = c.req.query("postname")
  const lang = c.req.query("lang") ?? "en"
  if (!postname) return c.json({ error: "Missing postname" }, 400)

  const rows = await db
    .select()
    .from(inlineComments)
    .where(and(eq(inlineComments.postname, postname), eq(inlineComments.lang, lang)))
    .orderBy(desc(inlineComments.created_at))

  return c.json({ comments: groupCommentsWithReplies(rows) })
})

export const POST = defineHandler(async (c) => {
  const user = getUser()
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const body = await c.req.json()
  const { postname, lang, block_index, start_offset, end_offset, selected_text, cursor_start, cursor_end, version_frontiers, parent_id, body: commentBody } = body

  if (!postname || !commentBody?.trim() || block_index === undefined || start_offset === undefined || end_offset === undefined || !selected_text) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  const [inserted] = await db
    .insert(inlineComments)
    .values({
      postname,
      lang: lang ?? "en",
      block_index,
      start_offset,
      end_offset,
      selected_text,
      cursor_start: cursor_start ? base64ToBuffer(cursor_start) : null,
      cursor_end: cursor_end ? base64ToBuffer(cursor_end) : null,
      version_frontiers: version_frontiers ? base64ToBuffer(version_frontiers) : null,
      parent_id: parent_id ?? null,
      github_user_id: user.id,
      github_username: user.name ?? "unknown",
      github_avatar_url: user.image ?? "",
      github_display_name: user.name ?? "Anonymous",
      body: commentBody.trim(),
      created_at: new Date(),
    })
    .returning()

  return c.json({ ok: true, id: inserted.id })
})

export const DELETE = defineHandler(async (c) => {
  const user = getUser()
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const id = Number(c.req.query("id"))
  if (!id) return c.json({ error: "Missing id" }, 400)

  const [comment] = await db.select().from(inlineComments).where(eq(inlineComments.id, id))
  if (!comment) return c.json({ error: "Not found" }, 404)
  if (comment.github_user_id !== user.id) return c.json({ error: "Forbidden" }, 403)

  await db.delete(inlineComments).where(eq(inlineComments.id, id))
  return c.json({ ok: true })
})
```

- [ ] **Step 4: Commit**

```bash
git add routes/api/inline-comments.ts plugins/__tests__/inline-comments-api.test.ts
git commit -m "feat: add inline comments CRUD API endpoint"
```

---

### Task 3: Enhance version-history plugin — export base64 snapshots

**Files:**
- Modify: `plugins/version-history.ts`

- [ ] **Step 1: Update PostHistory interface and extractHistory**

In `plugins/version-history.ts`, add `snapshot` field to `PostHistory`:

```typescript
interface PostHistory {
  versions: VersionEntry[]
  blocks: Array<{ type: string; content: string }>
  snapshot: string  // base64-encoded LoroDoc snapshot
}
```

Update `extractHistory` to accept snapshot bytes and encode as base64:

```typescript
function extractHistory(doc: LoroDoc, snapshotBytes: Uint8Array): PostHistory {
  const changes = doc.getAllChanges()
  const versions: VersionEntry[] = []
  for (const [peerId, peerChanges] of changes.entries()) {
    for (const change of peerChanges) {
      versions.push({
        id: `${peerId}:${change.counter}`,
        timestamp: change.timestamp,
        message: change.message ?? null,
      })
    }
  }
  versions.sort((a, b) => b.timestamp - a.timestamp)
  const blocks = readBlocksFromDoc(doc)

  // Encode snapshot as base64 for client-side LoroDoc usage
  let binary = ""
  for (let i = 0; i < snapshotBytes.length; i++) {
    binary += String.fromCharCode(snapshotBytes[i])
  }
  const snapshot = Buffer.from(snapshotBytes).toString("base64")

  return { versions, blocks, snapshot }
}
```

- [ ] **Step 2: Update buildStart to pass snapshot to extractHistory**

In the `buildStart` function, after the `if (changed)` block and before `historyMap[postKey] = extractHistory(doc)`, export snapshot:

```typescript
// Always export current snapshot for client-side cursor operations
const currentSnapshot = doc.export({ mode: "snapshot" })
historyMap[postKey] = extractHistory(doc, currentSnapshot)
```

Replace the existing `historyMap[postKey] = extractHistory(doc)` line.

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All 25+ tests PASS

- [ ] **Step 4: Commit**

```bash
git add plugins/version-history.ts
git commit -m "feat: export base64 LoroDoc snapshots in virtual:post-history"
```

---

### Task 4: Add i18n strings for inline comments

**Files:**
- Modify: `src/consts.ts`

- [ ] **Step 1: Add UI strings**

In `src/consts.ts`, add to the `UIStrings` interface:

```typescript
addComment: string
reply: string
signInToAnnotate: string
```

Add to the `en` object in `UI_STRINGS`:

```typescript
addComment: 'Comment',
reply: 'Reply',
signInToAnnotate: 'Sign in to comment',
```

Add to the `zh` object in `UI_STRINGS`:

```typescript
addComment: '评论',
reply: '回复',
signInToAnnotate: '登录以评论',
```

- [ ] **Step 2: Commit**

```bash
git add src/consts.ts
git commit -m "feat: add i18n strings for inline comments"
```

---

### Task 5: Server-side — load inline comments in post handlers

**Files:**
- Modify: `pages/[postname].server.ts`
- Modify: `pages/zh/[postname].server.ts`

- [ ] **Step 1: Update English post server**

In `pages/[postname].server.ts`:

1. Add import: `import { inlineComments } from "@schema"`
2. Add `inlineComments: any[]` to the `Props` interface
3. In the loader, after fetching `postComments`, add:

```typescript
const postInlineComments = await db
  .select()
  .from(inlineComments)
  .where(and(eq(inlineComments.postname, postname), eq(inlineComments.lang, "en")))
  .orderBy(desc(inlineComments.created_at))
```

4. Add `and` to the `void/db` import: `import { db, sql, eq, desc, and } from "void/db"`
5. Add `inlineComments: postInlineComments` to the return object

- [ ] **Step 2: Update Chinese post server**

Same changes in `pages/zh/[postname].server.ts` but with `lang: "zh"`:

1. Add import: `import { inlineComments } from "@schema"`
2. Add `inlineComments: any[]` to the `Props` interface
3. Add `and` to imports: `import { db, sql, eq, desc, and } from "void/db"`
4. Add inline comments query with `eq(inlineComments.lang, "zh")`
5. Add `inlineComments: postInlineComments` to return

- [ ] **Step 3: Commit**

```bash
git add pages/[postname].server.ts pages/zh/[postname].server.ts
git commit -m "feat: load inline comments in post server handlers"
```

---

### Task 6: InlineCommentLayer — text selection + popover

**Files:**
- Create: `src/components/InlineCommentLayer.tsx`

- [ ] **Step 1: Create the selection detection component**

Create `src/components/InlineCommentLayer.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from "react"
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
    // Delay to let selection finalize
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
      // Dismiss popover if clicking outside it
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

  const scrollY = window.scrollY
  const top = popover.y + scrollY

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 -translate-x-1/2 -translate-y-full"
      style={{ left: popover.x, top }}
    >
      <div className="rounded-lg border border-neutral-200 bg-white px-2 py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
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
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-neutral-700 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {t.addComment}
          </button>
        ) : (
          <button
            onClick={() => auth.signIn.social({ provider: "github" })}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            {t.signInToAnnotate}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InlineCommentLayer.tsx
git commit -m "feat: add InlineCommentLayer with text selection and popover"
```

---

### Task 7: InlineCommentSidebar — right sidebar with comment threads

**Files:**
- Create: `src/components/InlineCommentSidebar.tsx`

- [ ] **Step 1: Create sidebar component**

Create `src/components/InlineCommentSidebar.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InlineCommentSidebar.tsx
git commit -m "feat: add InlineCommentSidebar with thread cards and reply forms"
```

---

### Task 8: TextHighlighter — render highlights on commented text

**Files:**
- Create: `src/components/TextHighlighter.tsx`

- [ ] **Step 1: Create highlight component**

Create `src/components/TextHighlighter.tsx`:

```tsx
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

  const applyHighlights = useCallback(() => {
    // Clear existing highlights
    for (const el of highlightsRef.current) {
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
      }
    }
    highlightsRef.current = []

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
        // Fall back to not highlighting this one
      }
    }
  }, [proseRef, threads, activeThreadId, onHighlightClick])

  useEffect(() => {
    applyHighlights()
    return () => {
      for (const el of highlightsRef.current) {
        const parent = el.parentNode
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          parent.removeChild(el)
        }
      }
      highlightsRef.current = []
    }
  }, [applyHighlights])

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TextHighlighter.tsx
git commit -m "feat: add TextHighlighter for rendering comment highlights"
```

---

### Task 9: Integrate inline comments into post pages

**Files:**
- Create: `src/components/InlineComments.tsx`
- Modify: `pages/[postname].tsx`
- Modify: `pages/zh/[postname].tsx`

- [ ] **Step 1: Create orchestrator island component**

Create `src/components/InlineComments.tsx` — this coordinates all three inline comment sub-components:

```tsx
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
```

- [ ] **Step 2: Integrate into English post page**

In `pages/[postname].tsx`:

1. Add import:
```typescript
import InlineComments from "../src/components/InlineComments" with { island: "load" }
```

2. Add `inlineComments` to destructured props from `Props`

3. Wrap the existing `<div className="prose" ...>` and add the InlineComments island. Replace:

```tsx
<div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
```

With:

```tsx
<div className="flex gap-8">
  <div className="min-w-0 flex-1">
    <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
  </div>
  <InlineComments postname={postData.postname} lang={lang} user={user} initialComments={inlineComments} />
</div>
```

- [ ] **Step 3: Integrate into Chinese post page**

Same changes in `pages/zh/[postname].tsx`:

1. Add import:
```typescript
import InlineComments from "../../src/components/InlineComments" with { island: "load" }
```

2. Add `inlineComments` to destructured props

3. Same `<div className="flex gap-8">` wrapper around `.prose` and `InlineComments`

- [ ] **Step 4: Verify dev server starts**

Run: `npx vite dev`
Expected: Dev server starts without errors. Visit a blog post page — the layout should still render correctly with the sidebar area visible on desktop.

- [ ] **Step 5: Commit**

```bash
git add src/components/InlineComments.tsx pages/[postname].tsx pages/zh/[postname].tsx
git commit -m "feat: integrate inline comments into post pages"
```

---

### Task 10: Run all tests and verify build

- [ ] **Step 1: Run vitest**

Run: `npx vitest run`
Expected: All tests pass (25 existing + 4 new = 29 tests)

- [ ] **Step 2: Run vite build**

Run: `npx vite build`
Expected: Build succeeds. "Version history" plugin outputs as before.

- [ ] **Step 3: Start dev server and manually test**

Run: `npx vite dev`

Manual tests:
1. Visit a blog post
2. Select text in the post content
3. Verify a popover appears with "Comment" button (or "Sign in" if not logged in)
4. Verify the sidebar area is visible on the right
5. Verify `GET /api/inline-comments?postname=reasoning-control-flow&lang=en` returns `{"comments":[]}`

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during manual testing"
```
