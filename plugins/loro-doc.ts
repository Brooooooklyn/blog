import { LoroDoc, LoroList, LoroMap, LoroText } from "loro-crdt"
import type { Block } from "./block-parser"

/**
 * Read current blocks from a LoroDoc.
 */
export function readBlocksFromDoc(doc: LoroDoc): Block[] {
  const blocksList = doc.getList("blocks")
  const blocks: Block[] = []
  for (let i = 0; i < blocksList.length; i++) {
    const map = blocksList.get(i) as LoroMap
    blocks.push({
      type: map.get("type") as string,
      content: (map.get("content") as LoroText).toString(),
    })
  }
  return blocks
}

function appendBlock(blocksList: LoroList, block: Block) {
  const map = blocksList.insertContainer(blocksList.length, new LoroMap())
  map.set("type", block.type)
  const text = map.setContainer("content", new LoroText())
  text.insert(0, block.content)
}

/**
 * Apply blocks to a LoroDoc, diffing against current state.
 * Returns true if any changes were made.
 */
export function applyBlocksToDoc(doc: LoroDoc, newBlocks: Block[]): boolean {
  const blocksList = doc.getList("blocks")
  const currentLength = blocksList.length

  if (currentLength === 0) {
    for (const block of newBlocks) appendBlock(blocksList, block)
    return newBlocks.length > 0
  }

  let changed = false
  const minLen = Math.min(currentLength, newBlocks.length)

  for (let i = 0; i < minLen; i++) {
    const map = blocksList.get(i) as LoroMap
    const oldType = map.get("type") as string
    const oldText = map.get("content") as LoroText
    const oldContent = oldText.toString()
    const newBlock = newBlocks[i]

    if (oldType !== newBlock.type) {
      map.set("type", newBlock.type)
      oldText.delete(0, oldText.length)
      oldText.insert(0, newBlock.content)
      changed = true
    } else if (oldContent !== newBlock.content) {
      oldText.delete(0, oldText.length)
      oldText.insert(0, newBlock.content)
      changed = true
    }
  }

  if (currentLength > newBlocks.length) {
    for (let i = currentLength - 1; i >= newBlocks.length; i--) {
      blocksList.delete(i, 1)
    }
    changed = true
  }

  if (newBlocks.length > currentLength) {
    for (let i = currentLength; i < newBlocks.length; i++) {
      appendBlock(blocksList, newBlocks[i])
    }
    changed = true
  }

  return changed
}
