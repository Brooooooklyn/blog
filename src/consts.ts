export const SITE_TITLE = 'Moonglade'
export const SITE_URL = 'https://lyn.one'

export const AUTHOR = {
  name: '太狼',
  summary: {
    en: 'Frontend Developer at day, Rustacean at night.',
    zh: '白天前端开发，夜晚 Rustacean。',
  },
}

export const SOCIAL = {
  github: 'Brooooooklyn',
  twitter: 'Brooooook_lyn',
  huggingface: 'Brooooooklyn',
  resume: 'https://resume.lyn.one',
}

export const LANGUAGES = {
  en: 'English',
  zh: '中文',
} as const

export type Lang = keyof typeof LANGUAGES

export const DEFAULT_LANG: Lang = 'en'

export const LOCALE_MAP: Record<Lang, string> = { en: 'en-US', zh: 'zh-CN' }

interface UIStrings {
  allPosts: string
  tags: string
  taggedWith: string
  minRead: string
  prevPost: string
  nextPost: string
  toc: string
  builtWith: string
  backToAll: string
  postsTagged: string
}

export const UI_STRINGS: Record<Lang, UIStrings> = {
  en: {
    allPosts: 'All Posts',
    tags: 'Tags',
    taggedWith: 'Tagged with',
    minRead: 'min read',
    prevPost: 'Previous',
    nextPost: 'Next',
    toc: 'Table of Contents',
    builtWith: 'Built with',
    backToAll: 'All posts',
    postsTagged: 'posts tagged',
  },
  zh: {
    allPosts: '所有文章',
    tags: '标签',
    taggedWith: '标签：',
    minRead: '分钟阅读',
    prevPost: '上一篇',
    nextPost: '下一篇',
    toc: '目录',
    builtWith: '使用',
    backToAll: '所有文章',
    postsTagged: '篇文章',
  },
}
