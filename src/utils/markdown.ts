import { marked } from "marked"

export async function renderMarkdown(content: string): Promise<string> {
  return await marked(content)
}

export function extractHeadings(content: string): Array<{ depth: number; text: string; slug: string }> {
  const headings: Array<{ depth: number; text: string; slug: string }> = []
  const regex = /^(#{2,3})\s+(.+)$/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    const text = match[2].replace(/`[^`]*`/g, (m) => m.slice(1, -1))
    const slug = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
      .replace(/\s+/g, "-")
    headings.push({ depth: match[1].length, text, slug })
  }
  return headings
}
