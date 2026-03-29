import { marked, type Tokens } from "marked"

const renderer = {
  code({ text, lang }: Tokens.Code): string {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const langAttr = lang ? ` class="language-${lang}"` : ""
    return `<pre><code${langAttr}>${escaped}</code></pre>`
  },
}

marked.use({ renderer })

export async function renderMarkdown(content: string, slug?: string): Promise<string> {
  let text = content
  if (slug) {
    // Rewrite relative image paths to /blog-images/{slug}/
    text = text.replace(/!\[([^\]]*)\]\(\.\/([^)]+)\)/g, `![$1](/blog-images/${slug}/$2)`)
  }
  return await marked(text)
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
