import { defineConfig } from "vite"
import { voidPlugin } from "void"
import { voidReact } from "@void/react/plugin"
import tailwindcss from "@tailwindcss/vite"
import { generateFeeds } from "./plugins/generate-feeds"
import { githubLinks } from "./plugins/github-links"
import { subsetCodeFont } from "./plugins/subset-code-font"
import { prerenderPosts } from "./plugins/prerender-posts"

export default defineConfig({
  plugins: [generateFeeds(), githubLinks(), subsetCodeFont(), prerenderPosts(), voidPlugin(), voidReact(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
})
