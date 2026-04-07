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

/**
 * Apply blocks to a LoroDoc, diffing against current state.
 * Returns true if any changes were made.
 *
 * Strategy:
 * - Sequential positional comparison
 * - Same position + same type + different content → update LoroText in-place
 * - Same position + different type → replace (delete + insert)
 * - Extra new blocks → append
 * - Extra old blocks → delete from end
 */
export function applyBlocksToDoc(doc: LoroDoc, newBlocks: Block[]): boolean {
  const blocksList = doc.getList("blocks")
  const currentLength = blocksList.length

  // First build: populate from scratch
  if (currentLength === 0) {
    for (const block of newBlocks) {
      const map = blocksList.insertContainer(blocksList.length, new LoroMap())
      map.set("type", block.type)
      const text = map.setContainer("content", new LoroText())
      text.insert(0, block.content)
    }
    return newBlocks.length > 0
  }

  let changed = false
  const minLen = Math.min(currentLength, newBlocks.length)

  // Compare existing positions
  for (let i = 0; i < minLen; i++) {
    const map = blocksList.get(i) as LoroMap
    const oldType = map.get("type") as string
    const oldText = map.get("content") as LoroText
    const oldContent = oldText.toString()
    const newBlock = newBlocks[i]

    if (oldType !== newBlock.type) {
      // Type changed — update type and content
      map.set("type", newBlock.type)
      oldText.delete(0, oldText.length)
      oldText.insert(0, newBlock.content)
      changed = true
    } else if (oldContent !== newBlock.content) {
      // Same type, content changed — update LoroText in-place
      oldText.delete(0, oldText.length)
      oldText.insert(0, newBlock.content)
      changed = true
    }
  }

  // Delete extra old blocks (from end to avoid index shifting)
  if (currentLength > newBlocks.length) {
    for (let i = currentLength - 1; i >= newBlocks.length; i--) {
      blocksList.delete(i, 1)
    }
    changed = true
  }

  // Append new blocks
  if (newBlocks.length > currentLength) {
    for (let i = currentLength; i < newBlocks.length; i++) {
      const map = blocksList.insertContainer(blocksList.length, new LoroMap())
      map.set("type", newBlocks[i].type)
      const text = map.setContainer("content", new LoroText())
      text.insert(0, newBlocks[i].content)
    }
    changed = true
  }

  return changed
}
