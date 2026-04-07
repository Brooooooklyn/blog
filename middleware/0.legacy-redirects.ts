const LEGACY_URL_RE = /^\/(\d{4})\/(\d{2})\/(\d{2})\/(.+)$/

export default async function legacyRedirects(c: any, next: () => Promise<void>) {
  const match = c.req.path.match(LEGACY_URL_RE)
  if (match) {
    const postname = match[4]
    return c.redirect(`/${postname}`, 301)
  }
  return next()
}
