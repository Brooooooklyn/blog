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

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.toggle("dark", isDark)
    setDark(isDark)
  }, [])

  function toggle() {
    const isDark = !dark
    document.documentElement.classList.toggle("dark", isDark)
    localStorage.setItem("theme", isDark ? "dark" : "light")
    setDark(isDark)
  }

  return (
    <button onClick={toggle} aria-label="Toggle dark mode" className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
      {dark ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
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
