import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { scanBlogFiles } from "./shared"

export interface GitHubLinkMeta {
  owner: string
  repo: string
  type: "issue" | "pull"
  number: number
  title: string
  state: "open" | "closed" | "merged"
}

const GITHUB_LINK_SCAN_RE = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/g

function extractGitHubLinks(root: string): Array<{ owner: string; repo: string; type: "issue" | "pull"; number: number }> {
  const seen = new Set<string>()
  const links: Array<{ owner: string; repo: string; type: "issue" | "pull"; number: number }> = []

  for (const { raw } of scanBlogFiles(root)) {
      let match
      const re = new RegExp(GITHUB_LINK_SCAN_RE.source, "g")
      while ((match = re.exec(raw)) !== null) {
        const key = `${match[1]}/${match[2]}/${match[3]}/${match[4]}`
        if (seen.has(key)) continue
        seen.add(key)
        links.push({
          owner: match[1],
          repo: match[2],
          type: match[3] === "pull" ? "pull" : "issue",
          number: parseInt(match[4]),
        })
      }
  }
  return links
}

async function fetchGitHubMeta(
  link: { owner: string; repo: string; type: "issue" | "pull"; number: number },
): Promise<GitHubLinkMeta> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const headers: Record<string, string> = { "User-Agent": "moonglade-blog", Accept: "application/vnd.github.v3+json" }
  if (token) headers.Authorization = `token ${token}`

  const endpoint = link.type === "pull" ? "pulls" : "issues"
  const res = await fetch(`https://api.github.com/repos/${link.owner}/${link.repo}/${endpoint}/${link.number}`, { headers })

  if (!res.ok) {
    console.warn(`GitHub API ${res.status} for ${link.owner}/${link.repo}#${link.number}`)
    return { ...link, title: `#${link.number}`, state: "open" }
  }

  const data = (await res.json()) as Record<string, any>
  let state: "open" | "closed" | "merged" = data.state === "open" ? "open" : "closed"
  if (link.type === "pull" && data.merged) state = "merged"

  return { ...link, title: data.title, state }
}

export function githubLinks(): Plugin {
  let metaMap: Record<string, GitHubLinkMeta> = {}

  return {
    name: "github-links",
    enforce: "pre" as const,

    async buildStart() {
      const root = process.cwd()
      const cachePath = resolve(root, "node_modules/.cache/github-links.json")

      // Load cache
      let cache: Record<string, GitHubLinkMeta> = {}
      if (existsSync(cachePath)) {
        try {
          cache = JSON.parse(readFileSync(cachePath, "utf-8"))
        } catch {}
      }

      const links = extractGitHubLinks(root)
      const toFetch: typeof links = []

      for (const link of links) {
        const key = `${link.owner}/${link.repo}/${link.type}/${link.number}`
        if (cache[key]) {
          metaMap[key] = cache[key]
        } else {
          toFetch.push(link)
        }
      }

      if (toFetch.length > 0) {
        console.log(`Fetching ${toFetch.length} GitHub link(s)...`)
        const results = await Promise.all(toFetch.map(fetchGitHubMeta))
        for (const meta of results) {
          const key = `${meta.owner}/${meta.repo}/${meta.type}/${meta.number}`
          metaMap[key] = meta
        }
      }

      // Write cache
      const cacheDir = resolve(root, "node_modules/.cache")
      if (!existsSync(cacheDir)) {
        const { mkdirSync } = await import("node:fs")
        mkdirSync(cacheDir, { recursive: true })
      }
      writeFileSync(cachePath, JSON.stringify(metaMap, null, 2))

      console.log(`Resolved ${links.length} GitHub link(s)`)
    },
  }
}
