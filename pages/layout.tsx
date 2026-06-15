import "../src/styles/global.css"
import { useState, useEffect } from "react"
import { Link } from "@void/react"
import { SITE_TITLE, LANGUAGES, DEFAULT_LANG } from "../src/consts"
import type { Lang } from "../src/consts"
import { langPrefix } from "../src/utils/posts"

const DARK_MODE_INIT = `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()`

function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG)
  useEffect(() => {
    if (window.location.pathname.startsWith("/zh")) setLang("zh")
    else setLang("en")
  }, [])
  return lang
}

type ThemeMode = "light" | "dark" | "auto"

function applyTheme(mode: ThemeMode) {
  const isDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
}

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto")

  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null
    const initial = stored === "light" || stored === "dark" ? stored : "auto"
    setMode(initial)
    applyTheme(initial)

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if ((localStorage.getItem("theme") || "auto") === "auto") applyTheme("auto")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  function cycle() {
    const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light"
    if (next === "auto") localStorage.removeItem("theme")
    else localStorage.setItem("theme", next)
    setMode(next)
    applyTheme(next)
  }

  return (
    <button onClick={cycle} aria-label="Toggle theme" className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
      {mode === "light" ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : mode === "dark" ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
        </svg>
      )}
    </button>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const lang = useLang()
  const otherLang = lang === "en" ? "zh" : "en"

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DARK_MODE_INIT }} />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-16 flex items-center justify-between">
          <Link href={langPrefix(lang) || "/"} className="text-xl font-semibold tracking-tight text-neutral-900 no-underline dark:text-neutral-100">
            {SITE_TITLE}
          </Link>
          <nav className="flex items-center gap-4">
            <Link href={langPrefix(otherLang) || "/"} className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
              {LANGUAGES[otherLang]}
            </Link>
            <ThemeToggle />
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <p className="text-sm text-neutral-400 dark:text-neutral-600">
            &copy; {new Date().getFullYear()} Moonglade. Built with{" "}
            <a href="https://void.cloud" className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-600 dark:decoration-neutral-700 dark:hover:text-neutral-300">Void</a>.
          </p>
        </footer>
      </div>
    </>
  )
}
