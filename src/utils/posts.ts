import { getCollection } from 'astro:content'
import type { Lang } from '#consts.ts'
import { DEFAULT_LANG } from '#consts.ts'

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

export function langPrefix(lang: Lang): string {
  return lang === DEFAULT_LANG ? '' : `/${lang}`
}

export function getPostUrl(post: { data: { date: Date; postname: string } }, lang: Lang): string {
  return `${langPrefix(lang)}/${formatDate(post.data.date)}/${post.data.postname}`
}

export function getReadingTime(content: string): number {
  const wordsPerMinute = 300
  const cjkChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const latinWords = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  const totalWords = cjkChars + latinWords
  return Math.max(1, Math.ceil(totalWords / wordsPerMinute))
}

export async function getPostsByLang(lang: Lang) {
  const allPosts = await getCollection('blog')
  return allPosts
    .filter((post) => post.data.lang === lang)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

export async function getAllTags(lang: Lang): Promise<Map<string, number>> {
  const posts = await getPostsByLang(lang)
  const tags = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.data.tags ?? []) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
  }
  return tags
}
