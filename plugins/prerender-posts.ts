import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { marked, type Tokens } from "marked"
import { scanBlogFiles, parseFrontmatter } from "./shared"

import type { GitHubLinkMeta } from "./github-links"


async function createShikiHighlighter() {
  const { createHighlighter } = await import("shiki")
  const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript")
  return createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: ["python", "rust", "typescript", "javascript", "bash", "json", "toml", "yaml", "html", "css", "c", "cpp", "tsx"],
    engine: createJavaScriptRegexEngine(),
  })
}


const iconSvgs = {
  issueOpen: `<path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>`,
  issueClosed: `<path fill="currentColor" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/><path fill="currentColor" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"/>`,
  prOpen: `<path fill="currentColor" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>`,
  prClosed: `<path fill="currentColor" d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.28a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1-1.06 1.06L12 3.56l-.72.72a.75.75 0 0 1-1.06-1.06l2-2ZM3.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>`,
  prMerged: `<path fill="currentColor" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>`,
}

const iconColors: Record<string, string> = {
  issueOpen: "text-[#1a7f37] dark:text-[#3fb950]",
  issueClosed: "text-[#8250df] dark:text-[#a371f7]",
  prOpen: "text-[#1a7f37] dark:text-[#3fb950]",
  prClosed: "text-[#cf222e] dark:text-[#f85149]",
  prMerged: "text-[#8250df] dark:text-[#a371f7]",
}

const inlineSvgIcons: Record<string, string> = {
  "/icons/lmstudio.svg": `<svg class="inline-block align-[-0.125em] size-[1em] !m-0" fill="currentColor" fill-rule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.84 2a1.273 1.273 0 100 2.547h14.107a1.273 1.273 0 100-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H22.04a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h14.106a1.274 1.274 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H15.38a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h14.106a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h9.698a1.273 1.273 0 100-2.547h-9.698z" fill-opacity=".3"/><path d="M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z"/></svg>`,
  "/icons/ollama.svg": `<svg class="inline-block align-[-0.125em] size-[1em] !m-0" fill="currentColor" fill-rule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"/></svg>`,
}

const GITHUB_LINK_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/

function getGitHubIcon(meta: GitHubLinkMeta): string {
  let key: string
  if (meta.type === "pull") {
    key = meta.state === "merged" ? "prMerged" : meta.state === "closed" ? "prClosed" : "prOpen"
  } else {
    key = meta.state === "open" ? "issueOpen" : "issueClosed"
  }
  return `<svg class="shrink-0 ${iconColors[key]}" viewBox="0 0 16 16" width="16" height="16">${iconSvgs[key as keyof typeof iconSvgs]}</svg>`
}


function createMarkedRenderer(githubLinks: Record<string, GitHubLinkMeta>, highlighter: any) {
  const renderer = {
    table({ header, rows }: Tokens.Table): string {
      const headerCells = header.map((h: any) => `<th>${this.parser.parseInline(h.tokens)}</th>`).join("")
      const bodyRows = rows.map((row: any) =>
        `<tr>${row.map((cell: any) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`
      ).join("\n")
      return `<div class="overflow-x-auto -mx-1 px-1 [-webkit-overflow-scrolling:touch]"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
    },

    image({ href, text }: Tokens.Image): string | false {
      if (href && inlineSvgIcons[href]) return inlineSvgIcons[href]
      if (href?.startsWith("/icons/")) {
        return `<img src="${href}" alt="${text}" class="inline-block align-[-0.125em] size-[1em] !m-0 !rounded">`
      }
      return false
    },

    listitem({ tokens }: Tokens.ListItem): string {
      return `<li>${this.parser.parse(tokens)}</li>\n`
    },

    code(token: Tokens.Code): string {
      if (token.lang && highlighter) {
        try {
          const langs = highlighter.getLoadedLanguages()
          if (langs.includes(token.lang)) {
            return highlighter.codeToHtml(token.text, {
              lang: token.lang,
              themes: { light: "github-light", dark: "github-dark" },
            })
          }
        } catch {}
      }
      const escaped = token.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const langAttr = token.lang ? ` class="language-${token.lang}"` : ""
      return `<pre><code${langAttr}>${escaped}</code></pre>`
    },

    link({ href, text }: Tokens.Link): string | false {
      if (!href) return false
      const match = href.match(GITHUB_LINK_RE)
      if (!match) return false

      const [, owner, repo, type, number] = match
      const key = `${owner}/${repo}/${type === "pull" ? "pull" : "issue"}/${number}`
      const meta = githubLinks[key]
      if (!meta) return false

      const icon = getGitHubIcon(meta)
      const title = meta.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      return `<a href="${href}" class="inline-flex items-center gap-1 font-normal text-[0.85em] max-w-[min(100%,16em)] align-[-0.2em] leading-[inherit] underline decoration-neutral-300 dark:decoration-neutral-600 underline-offset-4 hover:decoration-neutral-900 dark:hover:decoration-neutral-100 transition-colors" target="_blank" rel="noopener noreferrer" title="${title}">${icon}<span class="font-semibold overflow-hidden text-ellipsis whitespace-nowrap">${title}</span><span class="shrink-0">#${meta.number}</span></a>`
    },
  }

  return renderer
}



export function prerenderPosts(): Plugin {
  const virtualModuleId = "virtual:prerendered-posts"
  const resolvedVirtualModuleId = "\0" + virtualModuleId

  // Map: "lang/postname" -> { html, headings }
  let postsMap: Record<string, { html: string; headings: Array<{ depth: number; text: string; slug: string }> }> = {}

  return {
    name: "prerender-posts",

    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `export default ${JSON.stringify(postsMap)}`
      }
    },

    enforce: "pre" as const,

    async buildStart() {
      const root = process.cwd()

      const ghCachePath = resolve(root, "node_modules/.cache/github-links.json")
      let githubLinks: Record<string, GitHubLinkMeta> = {}
      if (existsSync(ghCachePath)) {
        try { githubLinks = JSON.parse(readFileSync(ghCachePath, "utf-8")) } catch {}
      }

      const highlighter = await createShikiHighlighter()
      const renderer = createMarkedRenderer(githubLinks, highlighter)
      marked.use({ renderer })

      let count = 0
      for (const { dir, raw } of scanBlogFiles(root)) {
        const { data, content } = parseFrontmatter(raw)
        if (!data.postname || !data.lang) continue

        let text = content
        text = text.replace(/!\[([^\]]*)\]\(\.\/([^)]+)\)/g, `![$1](/blog-images/${dir}/$2)`)

        const html = await marked(text)

        const headings: Array<{ depth: number; text: string; slug: string }> = []
        const headingRegex = /^(#{2,3})\s+(.+)$/gm
        let m
        while ((m = headingRegex.exec(content)) !== null) {
          const hText = m[2].replace(/`[^`]*`/g, (match) => match.slice(1, -1))
          const hSlug = hText.toLowerCase().replace(/[^\w\u4e00-\u9fff\s-]/g, "").replace(/\s+/g, "-")
          headings.push({ depth: m[1].length, text: hText, slug: hSlug })
        }

        postsMap[`${data.lang}/${data.postname}`] = { html, headings }
        count++
      }

      highlighter.dispose()
      console.log(`Pre-rendered ${count} posts`)
    },
  }
}
