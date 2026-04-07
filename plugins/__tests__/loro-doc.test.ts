import { describe, it, expect } from "vitest"
import { LoroDoc } from "loro-crdt"
import { applyBlocksToDoc, readBlocksFromDoc } from "../loro-doc"
import type { Block } from "../block-parser"

function makeBlocks(...items: [string, string][]): Block[] {
  return items.map(([type, content]) => ({ type, content }))
}

describe("applyBlocksToDoc", () => {
  it("populates empty doc with blocks", () => {
    const doc = new LoroDoc()
    const blocks = makeBlocks(["heading", "## Title"], ["paragraph", "Hello world."])

    const changed = applyBlocksToDoc(doc, blocks)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks)
  })

  it("returns false when no blocks provided to empty doc", () => {
    const doc = new LoroDoc()
    expect(applyBlocksToDoc(doc, [])).toBe(false)
  })

  it("returns false when same blocks applied twice", () => {
    const doc = new LoroDoc()
    const blocks = makeBlocks(["heading", "## Title"], ["paragraph", "Hello."])

    applyBlocksToDoc(doc, blocks)
    doc.commit()

    const changed = applyBlocksToDoc(doc, blocks)
    expect(changed).toBe(false)
  })

  it("detects content edit in-place", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["paragraph", "Original text."])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["paragraph", "Updated text."])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })

  it("appends new blocks at end", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["heading", "## Title"])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["heading", "## Title"], ["paragraph", "New paragraph."])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })

  it("truncates blocks from end", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["heading", "## Title"], ["paragraph", "Para 1."], ["paragraph", "Para 2."])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["heading", "## Title"])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })

  it("handles type change at same position", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["paragraph", "Some text."])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["code", "```\nSome text.\n```"])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })

  it("handles insert in middle via positional diff", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["heading", "## A"], ["paragraph", "End."])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["heading", "## A"], ["code", "```\nx\n```"], ["paragraph", "End."])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })

  it("handles delete from middle via positional diff", () => {
    const doc = new LoroDoc()
    const blocks1 = makeBlocks(["heading", "## A"], ["code", "```\nx\n```"], ["paragraph", "End."])
    applyBlocksToDoc(doc, blocks1)
    doc.commit()

    const blocks2 = makeBlocks(["heading", "## A"], ["paragraph", "End."])
    const changed = applyBlocksToDoc(doc, blocks2)

    expect(changed).toBe(true)
    expect(readBlocksFromDoc(doc)).toEqual(blocks2)
  })
})

describe("version history tracking", () => {
  it("records multiple versions via commits", () => {
    const doc = new LoroDoc()
    doc.setPeerId("1")

    applyBlocksToDoc(doc, makeBlocks(["paragraph", "v1"]))
    doc.commit({ message: "v1" })

    applyBlocksToDoc(doc, makeBlocks(["paragraph", "v2"]))
    doc.commit({ message: "v2" })

    const changes = doc.getAllChanges()
    // Should have changes from peer "1"
    const peerChanges = changes.get("1")
    expect(peerChanges).toBeDefined()
    expect(peerChanges!.length).toBeGreaterThanOrEqual(2)
  })
})

describe("readBlocksFromDoc", () => {
  it("round-trips with applyBlocksToDoc", () => {
    const doc = new LoroDoc()
    const blocks = makeBlocks(
      ["heading", "## Title"],
      ["paragraph", "Some text."],
      ["code", "```ts\nconst x = 1;\n```"],
      ["list", "- a\n- b\n"],
    )

    applyBlocksToDoc(doc, blocks)
    const result = readBlocksFromDoc(doc)
    expect(result).toEqual(blocks)
  })

  it("returns empty array for empty doc", () => {
    const doc = new LoroDoc()
    expect(readBlocksFromDoc(doc)).toEqual([])
  })
})

describe("snapshot round-trip", () => {
  it("preserves blocks and history through export/import", () => {
    const doc = new LoroDoc()
    doc.setPeerId("1")

    applyBlocksToDoc(doc, makeBlocks(["paragraph", "v1"]))
    doc.commit({ message: "v1" })

    applyBlocksToDoc(doc, makeBlocks(["paragraph", "v2"]))
    doc.commit({ message: "v2" })

    const snapshot = doc.export({ mode: "snapshot" })

    const doc2 = new LoroDoc()
    doc2.import(snapshot)

    expect(readBlocksFromDoc(doc2)).toEqual(makeBlocks(["paragraph", "v2"]))

    const changes = doc2.getAllChanges()
    const peerChanges = changes.get("1")
    expect(peerChanges).toBeDefined()
    expect(peerChanges!.length).toBeGreaterThanOrEqual(2)
  })
})
