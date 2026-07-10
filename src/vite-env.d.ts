// Virtual modules produced by the local Vite plugins in ../plugins.

declare module "virtual:post-history" {
  interface VersionEntry {
    id: string
    timestamp: number
    message: string | null
  }
  interface PostHistory {
    versions: VersionEntry[]
    blocks: Array<{ type: string; content: string }>
  }
  // Keyed by `${lang}/${postname}` — see plugins/version-history.ts
  const postHistory: Record<string, PostHistory>
  export default postHistory
}

declare module "virtual:prerendered-posts" {
  interface PrerenderedPost {
    html: string
    headings: Array<{ depth: number; text: string; slug: string }>
  }
  // Keyed by `${lang}/${postname}` — see plugins/prerender-posts.ts
  const prerenderedPosts: Record<string, PrerenderedPost>
  export default prerenderedPosts
}
