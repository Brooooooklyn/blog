import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { scanBlogFiles } from "./shared"

const FONT_SOURCE = resolve(import.meta.dirname, "../fonts/SarasaFixedSC-Regular.ttf")
const CODE_BLOCK_RE = /```\w*\n([\s\S]*?)```/g

function extractCodeChars(root: string): string {
  const chars = new Set<string>()

  for (let i = 32; i < 127; i++) chars.add(String.fromCharCode(i))

  for (const { raw } of scanBlogFiles(root)) {
    let match
    const re = new RegExp(CODE_BLOCK_RE.source, "g")
    while ((match = re.exec(raw)) !== null) {
      for (const ch of match[1]) {
        if (ch.charCodeAt(0) >= 32) chars.add(ch)
      }
    }
  }

  return [...chars].join("")
}

/**
 * Vite plugin that subsets Sarasa Fixed SC to only characters used in code blocks.
 * Outputs a small WOFF2 font to public/fonts/.
 */
export function subsetCodeFont(): Plugin {
  return {
    name: "subset-code-font",

    async buildStart() {
      if (!existsSync(FONT_SOURCE)) {
        console.warn("subset-code-font: Font source not found at", FONT_SOURCE)
        return
      }

      const root = process.cwd()
      const outDir = resolve(root, "public/fonts")
      const outPath = resolve(outDir, "code-font.woff2")
      const charsPath = resolve(root, "node_modules/.cache/code-font-chars.txt")

      const chars = extractCodeChars(root)

      // Check cache — skip if chars haven't changed
      if (existsSync(charsPath) && existsSync(outPath)) {
        const cached = readFileSync(charsPath, "utf-8")
        if (cached === chars) {
          console.log(`Code font subset cached (${chars.length} chars)`)
          return
        }
      }

      const subsetFont = (await import("subset-font")).default
      const fontBuffer = readFileSync(FONT_SOURCE)

      const subset = await subsetFont(fontBuffer, chars, {
        targetFormat: "woff2",
      })

      mkdirSync(outDir, { recursive: true })
      writeFileSync(outPath, subset)

      // Write cache
      mkdirSync(resolve(root, "node_modules/.cache"), { recursive: true })
      writeFileSync(charsPath, chars)

      const sizeKB = (subset.byteLength / 1024).toFixed(1)
      console.log(`Subset code font: ${chars.length} chars → ${sizeKB} KB (public/fonts/code-font.woff2)`)
    },
  }
}
