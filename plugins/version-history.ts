import { createHash, createHmac } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import type { Plugin } from "vite"
import { LoroDoc } from "loro-crdt"
import { scanBlogFiles, parseFrontmatter } from "./shared"
import { parseMarkdownBlocks } from "./block-parser"
import { applyBlocksToDoc, readBlocksFromDoc } from "./loro-doc"

/**
 * Compute the miniflare D1 SQLite database path.
 * Replicates the logic from void's migration runner.
 */
function getMiniflareDatabasePath(persistRoot: string, databaseId: string): string {
  const uniqueKey = "miniflare-D1DatabaseObject"
  const key = createHash("sha256").update(uniqueKey).digest()
  const nameHmac = createHmac("sha256", key).update(databaseId).digest().subarray(0, 16)
  const hmac = createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16)
  const hash = Buffer.concat([nameHmac, hmac]).toString("hex")
  return join(persistRoot, "v3", "d1", uniqueKey, `${hash}.sqlite`)
}

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS post_snapshots (
  postname TEXT PRIMARY KEY NOT NULL,
  snapshot BLOB NOT NULL,
  updated_at INTEGER NOT NULL
)`

const SELECT_SQL = "SELECT snapshot FROM post_snapshots WHERE postname = ?"
const UPSERT_SQL = `INSERT INTO post_snapshots (postname, snapshot, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(postname) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`

export interface VersionHistoryOptions {
  /** Override the database path (useful for testing) */
  dbPath?: string
}

interface VersionEntry {
  id: string
  timestamp: number
  message: string | null
}

interface PostHistory {
  versions: VersionEntry[]
  blocks: Array<{ type: string; content: string }>
}

function extractHistory(doc: LoroDoc): PostHistory {
  const changes = doc.getAllChanges()
  const versions: VersionEntry[] = []
  for (const [peerId, peerChanges] of changes.entries()) {
    for (const change of peerChanges) {
      versions.push({
        id: `${peerId}:${change.counter}`,
        timestamp: change.timestamp,
        message: change.message ?? null,
      })
    }
  }
  versions.sort((a, b) => b.timestamp - a.timestamp)
  const blocks = readBlocksFromDoc(doc)
  return { versions, blocks }
}

export function versionHistory(options?: VersionHistoryOptions): Plugin {
  const virtualModuleId = "virtual:post-history"
  const resolvedVirtualModuleId = "\0" + virtualModuleId

  let historyMap: Record<string, PostHistory> = {}

  return {
    name: "version-history",
    enforce: "pre" as const,

    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `export default ${JSON.stringify(historyMap)}`
      }
    },

    async buildStart() {
      const root = process.cwd()

      let dbPath = options?.dbPath
      if (!dbPath) {
        dbPath = getMiniflareDatabasePath(join(root, ".void"), "local")
      }

      // Ensure parent directory exists
      const dbDir = join(dbPath, "..")
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true })
      }

      const db = new DatabaseSync(dbPath)
      try {
        db.exec(CREATE_TABLE_SQL)

        const selectStmt = db.prepare(SELECT_SQL)
        const upsertStmt = db.prepare(UPSERT_SQL)

        let updated = 0
        for (const { raw } of scanBlogFiles(root)) {
          const { data, content } = parseFrontmatter(raw)
          if (!data.postname || !data.lang) continue

          const postKey = `${data.lang}/${data.postname}`
          const blocks = parseMarkdownBlocks(content)

          const doc = new LoroDoc()
          doc.setPeerId("0")

          // Load existing snapshot
          const row = selectStmt.get(postKey) as { snapshot: Uint8Array } | undefined
          if (row) {
            doc.import(new Uint8Array(row.snapshot))
          }

          const changed = applyBlocksToDoc(doc, blocks)
          if (changed) {
            doc.commit({
              message: `Build ${new Date().toISOString()}`,
              timestamp: Date.now(),
            })

            const snapshot = doc.export({ mode: "snapshot" })
            upsertStmt.run(postKey, Buffer.from(snapshot), Date.now())
            updated++
          }

          // Always populate the virtual module with current history
          historyMap[postKey] = extractHistory(doc)
        }

        if (updated > 0) {
          console.log(`Version history: updated ${updated} post(s)`)
        }
      } finally {
        db.close()
      }
    },
  }
}
