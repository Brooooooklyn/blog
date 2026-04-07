import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

export interface BlogFile {
  dir: string
  file: string
  raw: string
}

let cached: { root: string; files: BlogFile[] } | null = null

export function scanBlogFiles(root: string): BlogFile[] {
  if (cached?.root === root) return cached.files
  const blogDir = resolve(root, "content/blog")
  const files: BlogFile[] = []
  for (const dir of readdirSync(blogDir)) {
    const dirPath = resolve(blogDir, dir)
    for (const file of readdirSync(dirPath).filter(f => f.endsWith(".md"))) {
      files.push({ dir, file, raw: readFileSync(resolve(dirPath, file), "utf-8") })
    }
  }
  cached = { root, files }
  return files
}

export function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    data[key] = value
  }
  return { data, content: match[2] }
}
