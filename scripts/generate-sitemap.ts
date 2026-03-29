import { readFileSync, readdirSync, writeFileSync } from "node:fs"

const SITE = "https://lyn.one"

interface PostMeta {
  postname: string
  date: string
  lang: string
}

function parseFrontmatter(raw: string): Record<string, any> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const data: Record<string, any> = {}
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/)
    if (m) data[m[1]] = m[2].replace(/^['"]|['"]$/g, "")
  }
  return data
}

function collectPosts(): PostMeta[] {
  const posts: PostMeta[] = []
  const blogDir = new URL("../content/blog", import.meta.url).pathname
  for (const dir of readdirSync(blogDir)) {
    const dirPath = `${blogDir}/${dir}`
    for (const file of readdirSync(dirPath).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(`${dirPath}/${file}`, "utf-8")
      const data = parseFrontmatter(raw)
      if (data.postname && data.date && data.lang) {
        posts.push({ postname: data.postname, date: data.date, lang: data.lang })
      }
    }
  }
  return posts
}

const posts = collectPosts()
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

const xml = `<?xml version="1.0" encoding="UTF-8"?>
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

writeFileSync(new URL("../public/sitemap.xml", import.meta.url).pathname, xml)
console.log(`Generated sitemap.xml with ${urls.length} URLs`)
