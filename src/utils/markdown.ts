import prerenderedPosts from "virtual:prerendered-posts"

interface PrerenderedPost {
  html: string
  headings: Array<{ depth: number; text: string; slug: string }>
}

const posts = prerenderedPosts as Record<string, PrerenderedPost>

export function getPrerenderedPost(postname: string, lang: string): PrerenderedPost | null {
  return posts[`${lang}/${postname}`] ?? null
}
