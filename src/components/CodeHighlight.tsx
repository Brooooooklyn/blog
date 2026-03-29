import { useEffect } from "react"

export default function CodeHighlight() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { codeToHtml } = await import("shiki")
      if (cancelled) return
      const blocks = document.querySelectorAll("pre code[class^='language-']")
      for (const block of blocks) {
        const lang = block.className.replace("language-", "")
        const text = block.textContent ?? ""
        try {
          const html = await codeToHtml(text, {
            lang,
            themes: { light: "github-light", dark: "github-dark" },
          })
          const pre = block.parentElement
          if (pre && !cancelled) {
            const wrapper = document.createElement("div")
            wrapper.innerHTML = html
            pre.replaceWith(wrapper.firstElementChild!)
          }
        } catch {
          // unsupported lang, leave as-is
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  return null
}
