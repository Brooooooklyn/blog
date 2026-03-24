import type { Lang } from "../consts"
import { DEFAULT_LANG } from "../consts"

export interface PostData {
  title: string
  date: Date
  postname: string
  author?: string
  header_img?: string
  tags?: string[]
  lang: Lang
}

export interface Post {
  data: PostData
  content: string
}

// Import all markdown files at build time via Vite's import.meta.glob
const mdFiles = import.meta.glob("/content/blog/**/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>

function parseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const frontmatter: Record<string, any> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    // Handle quoted strings
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    frontmatter[key] = value
  }
  // Parse tags (YAML array)
  const tagsMatch = match[1].match(/tags:\n((?:\s+-\s+.+\n?)+)/)
  if (tagsMatch) {
    frontmatter.tags = tagsMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\s+-\s+/, "").trim())
      .filter(Boolean)
  }
  return { data: frontmatter, content: match[2] }
}

let _allPosts: Post[] | null = null

function loadAllPosts(): Post[] {
  if (_allPosts) return _allPosts

  const posts: Post[] = []
  for (const [path, raw] of Object.entries(mdFiles)) {
    const { data, content } = parseFrontmatter(raw)
    if (!data.title || !data.date || !data.postname) continue
    posts.push({
      data: {
        title: data.title,
        date: new Date(data.date),
        postname: data.postname,
        author: data.author,
        header_img: data.header_img,
        tags: data.tags,
        lang: (data.lang as Lang) ?? "zh",
      },
      content,
    })
  }

  _allPosts = posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
  return _allPosts
}

export function getAllPosts(): Post[] {
  return loadAllPosts()
}

export function getPostsByLang(lang: Lang): Post[] {
  return getAllPosts().filter((p) => p.data.lang === lang)
}

export function getPostByName(postname: string, lang: Lang): Post | null {
  return getAllPosts().find((p) => p.data.postname === postname && p.data.lang === lang) ?? null
}

export function getReadingTime(content: string): number {
  const cjkChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const latinWords = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  return Math.max(1, Math.ceil((cjkChars + latinWords) / 300))
}

export function langPrefix(lang: Lang): string {
  return lang === DEFAULT_LANG ? "" : `/${lang}`
}

export function getPostUrl(post: { data: { postname: string } }, lang: Lang): string {
  return `${langPrefix(lang)}/${post.data.postname}`
}

export function getAllTags(lang: Lang): Map<string, number> {
  const posts = getPostsByLang(lang)
  const tags = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.data.tags ?? []) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
  }
  return tags
}
