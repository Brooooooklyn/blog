import "../src/styles/global.css"
import { Link } from "@void/react"
import { SITE_TITLE, LANGUAGES, DEFAULT_LANG } from "../src/consts"
import type { Lang } from "../src/consts"
import { langPrefix } from "../src/utils/posts"

export default function Layout({ children }: { children: React.ReactNode }) {
  const lang: Lang = DEFAULT_LANG
  const otherLang = lang === "en" ? "zh" : "en"

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-16 flex items-center justify-between">
        <Link href={`${langPrefix(lang)}/`} className="text-xl font-semibold tracking-tight text-neutral-900 no-underline dark:text-neutral-100">
          {SITE_TITLE}
        </Link>
        <nav className="flex items-center gap-4">
          <Link href={`${langPrefix(otherLang)}/`} className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
            {LANGUAGES[otherLang]}
          </Link>
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
  )
}
