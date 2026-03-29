import { AUTHOR, SOCIAL } from "../consts"
import type { Lang } from "../consts"

export default function Bio({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-start gap-4">
      <img src="/profile-pic.jpg" alt={AUTHOR.name} className="h-14 w-14 rounded-full object-cover" />
      <div>
        <p className="font-medium text-neutral-900 dark:text-neutral-100">{AUTHOR.name}</p>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{AUTHOR.summary[lang]}</p>
        <div className="mt-3 flex items-center gap-3">
          <SocialLink href={`https://github.com/${SOCIAL.github}`} label="GitHub">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
          </SocialLink>
          <SocialLink href={`https://twitter.com/${SOCIAL.twitter}`} label="Twitter">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </SocialLink>
          <SocialLink href={`https://huggingface.co/${SOCIAL.huggingface}`} label="Hugging Face">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-.5 3.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm3 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM8.5 9c.69 0 1.31.28 1.76.73.15.15.15.38 0 .54-.15.15-.38.15-.54 0A1.72 1.72 0 0 0 8.5 9.73c-.47 0-.9.19-1.22.54-.15.15-.38.15-.54 0a.39.39 0 0 1 0-.54C7.19 9.28 7.81 9 8.5 9zm5 0c.69 0 1.31.28 1.76.73.15.15.15.38 0 .54-.15.15-.38.15-.54 0a1.72 1.72 0 0 0-1.22-.54c-.47 0-.9.19-1.22.54-.15.15-.38.15-.54 0a.39.39 0 0 1 0-.54c.45-.45 1.07-.73 1.76-.73zm-4.53 3.5h4.06c.4 0 .72.32.72.72 0 1.84-1.49 3.28-3.25 3.28S7.25 15.06 7.25 13.22c0-.4.32-.72.72-.72z" /></svg>
          </SocialLink>
        </div>
      </div>
    </div>
  )
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200" aria-label={label}>
      {children}
    </a>
  )
}
