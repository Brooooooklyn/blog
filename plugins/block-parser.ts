import { marked } from "marked"

export interface Block {
  type: string
  content: string
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const tokens = marked.lexer(markdown)
  const blocks: Block[] = []

  for (const token of tokens) {
    if (token.type === "space") continue
    blocks.push({
      type: token.type,
      content: token.raw,
    })
  }

  return blocks
}
