import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().optional(),
    postname: z.string(),
    header_img: z.string().optional(),
    tags: z.array(z.string()).optional(),
    lang: z.enum(['zh', 'en']).default('zh'),
  }),
})

export const collections = { blog }
