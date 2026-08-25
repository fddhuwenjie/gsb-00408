import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data/app.db')

export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export interface Transaction<T> {
  run: (fn: () => T) => T
}

export function transaction<T>(fn: (tx: DatabaseType) => T): T {
  const tx = db.transaction(fn)
  return tx(db)
}

export default db
