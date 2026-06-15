/**
 * Regenerates the raster favicon set from scripts/favicon-source.svg.
 *
 * Pure Node — rasterization is done with @napi-rs/image (resvg-backed),
 * no external CLI. Run with:
 *   oxnode scripts/generate-favicons.ts
 *
 * Outputs into public/:
 *   favicon.ico                 (16 + 32 + 48, PNG-encoded)
 *   favicon-96x96.png
 *   apple-touch-icon.png        (180, opaque)
 *   web-app-manifest-192x192.png
 *   web-app-manifest-512x512.png
 *
 * The primary tab icon (public/favicon.svg) is hand-authored and theme-aware,
 * so it is intentionally NOT generated here.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ResizeFilterType, Transformer } from "@napi-rs/image"

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, "..", "public")
const svg = readFileSync(resolve(here, "favicon-source.svg"))

// @napi-rs/image rasterizes the SVG onto a canvas twice its declared size,
// drawing the artwork at 1:1 in the top-left quadrant. Crop back to that
// quadrant so the badge fills the frame edge-to-edge. crop() and resize()
// must run as separate passes (re-decoding the PNG in between) — chaining
// them on one Transformer mis-places the result.
const native = await Transformer.fromSvg(svg).png()
const half = native.readUInt32BE(16) / 2 // PNG IHDR width
const badge = await new Transformer(native).crop(0, 0, half, half).png()

/** Render the cropped badge to a square PNG buffer of the given size. */
function render(size: number): Promise<Buffer> {
  return new Transformer(badge).resize(size, size, ResizeFilterType.Lanczos3).png()
}

/** Wrap PNG buffers in an ICO container (Vista+ PNG-in-ICO format). */
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(16 * images.length)
  const blobs: Buffer[] = []
  let offset = 6 + entries.length

  images.forEach((img, i) => {
    const e = entries.subarray(i * 16, i * 16 + 16)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0) // width (0 == 256)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1) // height
    e.writeUInt8(0, 2) // palette size
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(img.data.length, 8) // image byte size
    e.writeUInt32LE(offset, 12) // offset from file start
    offset += img.data.length
    blobs.push(img.data)
  })

  return Buffer.concat([header, entries, ...blobs])
}

const icoSizes = [16, 32, 48]
const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({ size, data: await render(size) })),
)
writeFileSync(resolve(publicDir, "favicon.ico"), buildIco(icoImages))

const pngTargets: Record<string, number> = {
  "favicon-96x96.png": 96,
  "apple-touch-icon.png": 180,
  "web-app-manifest-192x192.png": 192,
  "web-app-manifest-512x512.png": 512,
}
await Promise.all(
  Object.entries(pngTargets).map(async ([name, size]) => {
    writeFileSync(resolve(publicDir, name), await render(size))
  }),
)

console.log(`favicon.ico (${icoSizes.join(", ")}) + ${Object.keys(pngTargets).length} PNGs written to public/`)
