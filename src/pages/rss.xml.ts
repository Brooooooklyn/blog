import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getCollection } from 'astro:content'
import { SITE_TITLE, AUTHOR } from '#consts.ts'
import { getPostUrl } from '#utils/posts.ts'

export async function GET(context: APIContext) {
  const posts = await getCollection('blog')
  const sorted = posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  return rss({
    title: SITE_TITLE,
    description: `Blog by ${AUTHOR.name}`,
    site: context.site!,
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      link: getPostUrl(post, post.data.lang),
    })),
  })
}
