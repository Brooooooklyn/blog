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
