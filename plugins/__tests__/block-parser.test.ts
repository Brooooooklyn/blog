import { describe, it, expect } from "vitest"
import { parseMarkdownBlocks } from "../block-parser"

describe("parseMarkdownBlocks", () => {
  it("parses a heading into a single block", () => {
    const blocks = parseMarkdownBlocks("## Hello World\n")
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("heading")
    expect(blocks[0].content).toContain("## Hello World")
  })

  it("parses multiple paragraphs into separate blocks", () => {
    const blocks = parseMarkdownBlocks("First paragraph.\n\nSecond paragraph.\n")
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe("paragraph")
    expect(blocks[1].type).toBe("paragraph")
    expect(blocks[0].content).toContain("First paragraph.")
    expect(blocks[1].content).toContain("Second paragraph.")
  })

  it("parses code blocks with language annotation", () => {
    const md = "```typescript\nconst x = 1;\n```\n"
    const blocks = parseMarkdownBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("code")
    expect(blocks[0].content).toContain("const x = 1;")
  })

  it("parses mixed content", () => {
    const md = `## Title

Some text here.

\`\`\`ts
const x = 1;
\`\`\`

- item 1
- item 2
`
    const blocks = parseMarkdownBlocks(md)
    expect(blocks).toHaveLength(4)
    expect(blocks[0].type).toBe("heading")
    expect(blocks[1].type).toBe("paragraph")
    expect(blocks[2].type).toBe("code")
    expect(blocks[3].type).toBe("list")
  })

  it("skips whitespace-only tokens", () => {
    const md = "## Title\n\n\n\nParagraph.\n"
    const blocks = parseMarkdownBlocks(md)
    // space tokens between heading and paragraph should be skipped
    const types = blocks.map((b) => b.type)
    expect(types).not.toContain("space")
  })

  it("handles empty input", () => {
    const blocks = parseMarkdownBlocks("")
    expect(blocks).toHaveLength(0)
  })

  it("preserves raw markdown content", () => {
    const md = "## Hello **bold** World\n"
    const blocks = parseMarkdownBlocks(md)
    expect(blocks[0].content).toContain("## Hello **bold** World")
  })
})
