# Notion-Style Inline Comments

## Problem

The blog has a bottom-of-page comment system (GitHub-authenticated, stored in D1). Readers can only leave general comments about an entire post. There's no way to comment on specific text — no annotations, no inline discussion, no contextual feedback.

## Goal

Add Notion-style inline comments: users select text, click "Comment", and leave a comment anchored to that exact text range. Comments appear in a right sidebar aligned to the highlighted text. Comments survive content edits via Loro CRDT cursor tracking (built in the version history feature).

## Constraints

- GitHub authentication required (existing auth flow via better-auth)
- Must work with the existing block-level version history (Loro CRDT snapshots in D1)
- Must support dark mode
- Post content is rendered via `dangerouslySetInnerHTML` from prerendered HTML — text selection must work across HTML elements
- Mobile: sidebar collapses, comments accessible via a different affordance

## Data Model

### New table: `inline_comments`

```sql
CREATE TABLE inline_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postname TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  block_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  cursor_start BLOB,
  cursor_end BLOB,
  version_frontiers BLOB,
  parent_id INTEGER REFERENCES inline_comments(id),
  github_user_id TEXT NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT NOT NULL,
  github_display_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Key fields:**

- `block_index`: Position of the block in the LoroList("blocks"). Maps to the nth top-level markdown element.
- `start_offset` / `end_offset`: Character offsets within the block's rendered text content. These are DOM text offsets (not markdown offsets) since selection happens in rendered HTML.
- `selected_text`: The exact text the user highlighted. Stored for display even if content changes later.
- `cursor_start` / `cursor_end`: Encoded Loro cursors (`LoroText.getCursor(offset).encode()`). These track position through content edits.
- `version_frontiers`: Serialized `doc.frontiers()` at comment creation time. Enables "view original version" by calling `doc.forkAt(frontiers)`.
- `parent_id`: Nullable. When set, this comment is a reply to the comment with that ID. Single-level threading only (replies cannot have replies).

### Drizzle schema addition

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

## Architecture

### Build-time: Version History Plugin Enhancement

The existing `plugins/version-history.ts` already stores LoroDoc snapshots in D1 and exposes a `virtual:post-history` module with version metadata and blocks.

**Enhancement needed:** The virtual module currently exports `{ versions, blocks }` per post. To support Loro cursor operations at runtime, we need to also export the raw LoroDoc snapshot (base64-encoded) so the runtime can:
1. Create cursors for new comments: `LoroText.getCursor(offset)`
2. Resolve cursor positions for existing comments: `doc.getCursorPos(cursor)`
3. Fork at historical versions: `doc.forkAt(frontiers)`

**However**, `loro-crdt` uses WASM and cannot run in Cloudflare Workers. So cursor creation and resolution must happen **client-side**. The virtual module exports base64 snapshots, the client loads them into a `LoroDoc` in the browser.

Updated virtual module shape:
```typescript
{
  "en/postname": {
    versions: [...],
    blocks: [...],
    snapshot: "<base64-encoded LoroDoc snapshot>"
  }
}
```

### Runtime API

#### `GET /api/inline-comments?postname=X&lang=en`

Returns all inline comments for a post, grouped by their text range (block_index + offsets):

```json
{
  "comments": [
    {
      "id": 1,
      "block_index": 3,
      "start_offset": 42,
      "end_offset": 87,
      "selected_text": "the highlighted text",
      "cursor_start": "<base64>",
      "cursor_end": "<base64>",
      "version_frontiers": "<base64>",
      "parent_id": null,
      "github_username": "user",
      "github_avatar_url": "https://...",
      "github_display_name": "User Name",
      "body": "This is interesting!",
      "created_at": 1712534400000,
      "replies": [
        {
          "id": 2,
          "parent_id": 1,
          "github_username": "other",
          "github_avatar_url": "https://...",
          "github_display_name": "Other User",
          "body": "I agree!",
          "created_at": 1712534500000
        }
      ]
    }
  ]
}
```

#### `POST /api/inline-comments`

Requires authentication. Body:

```json
{
  "postname": "reasoning-control-flow",
  "lang": "en",
  "block_index": 3,
  "start_offset": 42,
  "end_offset": 87,
  "selected_text": "the highlighted text",
  "cursor_start": "<base64>",
  "cursor_end": "<base64>",
  "version_frontiers": "<base64>",
  "parent_id": null,
  "body": "This is interesting!"
}
```

Cursor data is computed client-side (where `loro-crdt` WASM can run) and sent as base64-encoded blobs.

#### `DELETE /api/inline-comments/:id`

Requires authentication. Only the comment author can delete their own comment.

### Client-Side Components

Three new island components:

#### 1. `InlineCommentLayer`

**Purpose:** Detects text selection in the post content area, shows a popover with "Comment" button.

**Behavior:**
- Listens for `mouseup` / `selectionchange` events on the `.prose` container
- When a non-empty text selection exists within the prose area:
  - Computes the selection's block index (which top-level element) and character offsets
  - Shows a small floating popover near the selection with a comment icon/button
  - If user is not authenticated: shows "Sign in with GitHub" instead
- When user clicks "Comment":
  - Computes Loro cursors client-side using the snapshot from `virtual:post-history`
  - Opens the comment form in the sidebar at the correct vertical position
  - Preserves the selection highlight

**Block index computation:**
The prose content is rendered as HTML. Each top-level element (p, h2, h3, pre, ul, ol, blockquote, hr, table) corresponds to a block. To find the block index:
1. Get all direct children of the `.prose` container
2. Find which child contains the selection's anchorNode
3. That child's index = block_index
4. Character offsets are computed relative to that child's `textContent`

#### 2. `InlineCommentSidebar`

**Purpose:** Right sidebar showing comment threads aligned to their highlighted text.

**Layout:**
- Fixed-width sidebar (280-320px) to the right of the post content
- Each comment group is positioned vertically to align with its highlighted text
- If groups overlap vertically, they stack with small gaps (like Notion)
- Shows: highlighted text quote, comment body, author avatar + name, timestamp, reply button
- Reply form: appears inline below the comment when "Reply" is clicked
- Collapse/expand: each comment group can be collapsed to just show the count

**Mobile behavior:**
- Sidebar hidden on screens < 1280px
- Instead, a floating comment count badge appears on highlighted text
- Tapping the badge opens a bottom sheet with the comments

#### 3. `TextHighlighter`

**Purpose:** Renders visual highlights on text that has inline comments.

**Implementation:**
- On mount, receives the list of inline comments with their block_index + offsets
- For comments with Loro cursors: resolves current positions using the LoroDoc snapshot client-side
- Uses the Range API to create highlight ranges in the DOM
- Applies a CSS highlight (subtle yellow/orange background, like Notion)
- Clicking a highlight scrolls the sidebar to the corresponding comment group
- Highlights for the "active" (currently viewed in sidebar) comment group are more prominent

**Cursor resolution flow:**
1. Load LoroDoc from base64 snapshot in virtual module
2. For each comment's `cursor_start` and `cursor_end`:
   - Decode: `Cursor.decode(base64ToUint8Array(cursor))`
   - Resolve: `doc.getCursorPos(cursor)` → `{ offset, side }`
   - Use resolved offsets instead of stored `start_offset`/`end_offset`
3. If cursor resolution fails (text deleted): fall back to stored offsets, mark as "orphaned"

## Interaction Flow

### Creating a comment

1. User reads a blog post
2. User selects text within the post content
3. A small popover appears near the selection with a comment icon
4. User clicks the icon
   - If not logged in → "Sign in with GitHub" button, auth redirect, return to post
   - If logged in → comment form appears in sidebar at the right Y position
5. User types comment and clicks Submit
6. Client computes Loro cursors from the LoroDoc snapshot
7. `POST /api/inline-comments` with all data
8. Highlight appears on the selected text
9. Comment appears in sidebar

### Replying to a comment

1. User clicks "Reply" on an existing comment in the sidebar
2. Reply form appears below the comment
3. User types and submits
4. `POST /api/inline-comments` with `parent_id` set to the parent comment's ID
5. Reply appears nested under the parent

### Viewing comments on changed text

1. Post content was edited since the comment was created
2. Client loads LoroDoc snapshot and resolves cursors to new positions
3. Highlight appears at the new (shifted) position
4. Comment sidebar shows "commented on version from [date]" with a "View original" link
5. Clicking "View original" shows the original text from `selected_text` field

## Styling

- Highlights: `bg-amber-100/60 dark:bg-amber-500/20` with `cursor-pointer`
- Active highlight: `bg-amber-200/80 dark:bg-amber-500/30`
- Sidebar: `border-l border-neutral-200 dark:border-neutral-700`, `bg-white dark:bg-neutral-900`
- Comment cards: match existing CommentSection styling (rounded-lg, neutral borders)
- Popover: small floating element with shadow, `bg-white dark:bg-neutral-800`, rounded

## Testing Strategy

### Unit tests (vitest)
- Inline comment API: CRUD operations, auth gating, reply threading
- Block index + offset computation from DOM selection (jsdom)
- Cursor resolution: encode/decode round-trip, position tracking after edits

### Integration tests
- Create comment → fetch comments → verify data
- Reply to comment → verify threading
- Delete comment → verify removal

## Files to Create/Modify

| File | Action |
|------|--------|
| `db/schema.ts` | Modify — add `inlineComments` table |
| `db/migrations/0002_inline_comments.sql` | Create — migration |
| `db/migrations/meta/_journal.json` | Modify — add entry |
| `routes/api/inline-comments.ts` | Create — CRUD API |
| `src/components/InlineCommentLayer.tsx` | Create — selection detection + popover |
| `src/components/InlineCommentSidebar.tsx` | Create — right sidebar |
| `src/components/TextHighlighter.tsx` | Create — highlight overlays |
| `plugins/version-history.ts` | Modify — export base64 snapshots in virtual module |
| `pages/[postname].tsx` | Modify — integrate inline comment components |
| `pages/[postname].server.ts` | Modify — load inline comments |
| `pages/zh/[postname].tsx` | Modify — same for Chinese posts |
| `pages/zh/[postname].server.ts` | Modify — same for Chinese posts |

## Out of Scope

- Emoji reactions on inline comments (can add later)
- Resolve/archive comment threads (can add later)
- Email/notification when someone replies
- Admin moderation tools
- Rich text in comment bodies (plain text only)
