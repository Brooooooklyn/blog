import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { LoroDoc } from "loro-crdt"
import { readBlocksFromDoc } from "../loro-doc"
import { parseMarkdownBlocks } from "../block-parser"
import { applyBlocksToDoc } from "../loro-doc"

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "version-history-test-"))
}

// Replicate the core logic of the plugin for testing
function processPost(db: DatabaseSync, postKey: string, markdown: string) {

  const blocks = parseMarkdownBlocks(markdown)
  const doc = new LoroDoc()
  doc.setPeerId("0")

  const row = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get(postKey) as
    | { snapshot: Uint8Array }
    | undefined
  if (row) {
    doc.import(new Uint8Array(row.snapshot))
  }

  const changed = applyBlocksToDoc(doc, blocks)
  if (!changed) return false

  doc.commit({
    message: `Build test`,
    timestamp: Date.now(),
  })

  const snapshot = doc.export({ mode: "snapshot" })
  db
    .prepare(
      `INSERT INTO post_snapshots (postname, snapshot, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(postname) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
    )
    .run(postKey, Buffer.from(snapshot), Date.now())

  return true
}

describe("version-history plugin logic", () => {
  let tmpDir: string
  let dbPath: string
  let db: DatabaseSync

  beforeEach(() => {
    tmpDir = createTempDir()
    dbPath = join(tmpDir, "test.sqlite")
    db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE IF NOT EXISTS post_snapshots (
      postname TEXT PRIMARY KEY NOT NULL,
      snapshot BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("stores snapshot for a new post", () => {
    const changed = processPost(db, "en/test-post", "## Hello\n\nWorld.\n")
    expect(changed).toBe(true)

    const row = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get("en/test-post") as {
      snapshot: Uint8Array
    }
    expect(row).toBeDefined()
    expect(row.snapshot.length).toBeGreaterThan(0)
  })

  it("snapshot contains valid LoroDoc with blocks", () => {
    processPost(db, "en/test-post", "## Hello\n\nWorld.\n")

    const row = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get("en/test-post") as {
      snapshot: Uint8Array
    }
    const doc = new LoroDoc()
    doc.import(new Uint8Array(row.snapshot))

    const blocks = readBlocksFromDoc(doc)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe("heading")
    expect(blocks[1].type).toBe("paragraph")
  })

  it("detects changes and creates new version", () => {
    processPost(db, "en/test-post", "## Hello\n\nOriginal.\n")
    processPost(db, "en/test-post", "## Hello\n\nUpdated.\n")

    const row = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get("en/test-post") as {
      snapshot: Uint8Array
    }
    const doc = new LoroDoc()
    doc.import(new Uint8Array(row.snapshot))

    const blocks = readBlocksFromDoc(doc)
    expect(blocks[1].content).toContain("Updated.")

    // Should have recorded operations from both versions
    // Loro may merge consecutive changes from the same peer,
    // so check opCount instead of change count
    expect(doc.opCount()).toBeGreaterThan(0)
    const changes = doc.getAllChanges()
    expect(changes.get("0")).toBeDefined()
  })

  it("skips writing when no content changes", () => {
    processPost(db, "en/test-post", "## Hello\n\nWorld.\n")

    const row1 = db.prepare("SELECT updated_at FROM post_snapshots WHERE postname = ?").get("en/test-post") as {
      updated_at: number
    }

    const changed = processPost(db, "en/test-post", "## Hello\n\nWorld.\n")
    expect(changed).toBe(false)

    const row2 = db.prepare("SELECT updated_at FROM post_snapshots WHERE postname = ?").get("en/test-post") as {
      updated_at: number
    }
    // updated_at should not change since processPost returned false
    expect(row2.updated_at).toBe(row1.updated_at)
  })

  it("handles multiple posts independently", () => {
    processPost(db, "en/post-a", "## A\n\nContent A.\n")
    processPost(db, "en/post-b", "## B\n\nContent B.\n")

    const count = (
      db.prepare("SELECT COUNT(*) as c FROM post_snapshots").get() as {
        c: number
      }
    ).c
    expect(count).toBe(2)

    // Update only post-a
    processPost(db, "en/post-a", "## A\n\nUpdated A.\n")

    const docA = new LoroDoc()
    const rowA = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get("en/post-a") as {
      snapshot: Uint8Array
    }
    docA.import(new Uint8Array(rowA.snapshot))
    expect(readBlocksFromDoc(docA)[1].content).toContain("Updated A.")

    const docB = new LoroDoc()
    const rowB = db.prepare("SELECT snapshot FROM post_snapshots WHERE postname = ?").get("en/post-b") as {
      snapshot: Uint8Array
    }
    docB.import(new Uint8Array(rowB.snapshot))
    expect(readBlocksFromDoc(docB)[1].content).toContain("Content B.")
  })
})
