import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { scanBlogFiles, parseFrontmatter } from "./shared"

const SITE = "https://lyn.one"
const TITLE = "Moonglade"
const DESCRIPTION = "LongYinan's Blog"

interface PostMeta {
  title: string
  postname: string
  date: string
  description?: string
  lang: string
}

function collectPosts(root: string): PostMeta[] {
  const posts: PostMeta[] = []
  for (const { raw } of scanBlogFiles(root)) {
    const { data } = parseFrontmatter(raw)
    if (data.title && data.postname && data.date && data.lang) {
      posts.push({
        title: data.title,
        postname: data.postname,
        date: data.date,
        description: data.description,
        lang: data.lang,
      })
    }
  }
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function generateSitemap(posts: PostMeta[]): string {
  const enPosts = posts.filter((p) => p.lang === "en")
  const zhPosts = posts.filter((p) => p.lang === "zh")

  const urls: Array<{ loc: string; lastmod?: string; priority: string }> = [
    { loc: "/", priority: "1.0" },
    { loc: "/zh", priority: "0.8" },
  ]
  for (const p of enPosts) {
    urls.push({ loc: `/${p.postname}`, lastmod: p.date, priority: "0.8" })
  }
  for (const p of zhPosts) {
    urls.push({ loc: `/zh/${p.postname}`, lastmod: p.date, priority: "0.7" })
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>
    <loc>${SITE}${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`
}

function generateRss(posts: PostMeta[]): string {
  const enPosts = posts.filter((p) => p.lang === "en")

  const items = enPosts
    .map(
      (p) =>
        `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE}/${p.postname}</link>
      <guid>${SITE}/${p.postname}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>${p.description ? `\n      <description>${escapeXml(p.description)}</description>` : ""}
    </item>`,
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${TITLE}</title>
    <link>${SITE}</link>
    <description>${DESCRIPTION}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

export function generateFeeds(): Plugin {
  return {
    name: "generate-feeds",
    buildStart() {
      const root = process.cwd()
      const posts = collectPosts(root)
      const publicDir = resolve(root, "public")

      const sitemap = generateSitemap(posts)
      writeFileSync(resolve(publicDir, "sitemap.xml"), sitemap)

      const rss = generateRss(posts)
      writeFileSync(resolve(publicDir, "rss.xml"), rss)

      const enCount = posts.filter((p) => p.lang === "en").length
      const total = posts.length
      console.log(`Generated sitemap.xml (${total} URLs) and rss.xml (${enCount} items)`)
    },
  }
}
