import db, { transaction } from '../db/index.js'
import type { SensitiveWord, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateSensitiveWordParams {
  word: string
  category: string
  version?: number
  is_active?: boolean
}

export interface UpdateSensitiveWordParams {
  word?: string
  category?: string
  version?: number
  is_active?: boolean
}

export async function create(params: CreateSensitiveWordParams): Promise<SensitiveWord> {
  const currentVersion = await getCurrentVersion()
  return transaction((tx) => {
    const now = new Date().toISOString()
    const version = params.version ?? currentVersion + 1
    const stmt = tx.prepare(`
      INSERT INTO sensitive_words (word, category, version, is_active, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.word,
      params.category,
      version,
      params.is_active !== undefined ? (params.is_active ? 1 : 0) : 1,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, word, category, version, is_active, created_at
      FROM sensitive_words
      WHERE id = ?
    `)
    return selectStmt.get(id) as SensitiveWord
  })
}

export async function findById(id: number): Promise<SensitiveWord | null> {
  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE id = ?
  `)
  return stmt.get(id) as SensitiveWord | null
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<SensitiveWord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM sensitive_words')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    ORDER BY version DESC, created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as SensitiveWord[]

  return { items, total, page, pageSize }
}

export async function getCurrentVersion(): Promise<number> {
  const stmt = db.prepare('SELECT MAX(version) as max_version FROM sensitive_words')
  const result = stmt.get() as { max_version: number | null }
  return result.max_version || 0
}

export async function getActiveWordsByVersion(version: number): Promise<SensitiveWord[]> {
  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE version = ? AND is_active = 1
    ORDER BY created_at DESC
  `)
  return stmt.all(version) as SensitiveWord[]
}

export async function getActiveWords(): Promise<SensitiveWord[]> {
  const currentVersion = await getCurrentVersion()
  return getActiveWordsByVersion(currentVersion)
}

export async function findByCategory(category: string, params?: PaginationParams): Promise<PaginationResult<SensitiveWord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM sensitive_words WHERE category = ?')
  const { total } = countStmt.get(category) as { total: number }

  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE category = ?
    ORDER BY version DESC, created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(category, pageSize, offset) as SensitiveWord[]

  return { items, total, page, pageSize }
}

export async function findByVersion(version: number, params?: PaginationParams): Promise<PaginationResult<SensitiveWord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM sensitive_words WHERE version = ?')
  const { total } = countStmt.get(version) as { total: number }

  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE version = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(version, pageSize, offset) as SensitiveWord[]

  return { items, total, page, pageSize }
}

export async function findActive(params?: PaginationParams): Promise<PaginationResult<SensitiveWord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM sensitive_words WHERE is_active = 1')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE is_active = 1
    ORDER BY version DESC, created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as SensitiveWord[]

  return { items, total, page, pageSize }
}

export async function findByWord(word: string): Promise<SensitiveWord | null> {
  const stmt = db.prepare(`
    SELECT id, word, category, version, is_active, created_at
    FROM sensitive_words
    WHERE word = ?
    ORDER BY version DESC
    LIMIT 1
  `)
  return stmt.get(word) as SensitiveWord | null
}

export async function createNewVersion(words: Omit<CreateSensitiveWordParams, 'version'>[]): Promise<SensitiveWord[]> {
  const currentVersion = await getCurrentVersion()
  const newVersion = currentVersion + 1
  return transaction((tx) => {
    const now = new Date().toISOString()
    const createdWords: SensitiveWord[] = []

    const stmt = tx.prepare(`
      INSERT INTO sensitive_words (word, category, version, is_active, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const selectStmt = tx.prepare(`
      SELECT id, word, category, version, is_active, created_at
      FROM sensitive_words
      WHERE id = ?
    `)

    for (const wordParams of words) {
      const result = stmt.run(
        wordParams.word,
        wordParams.category,
        newVersion,
        wordParams.is_active !== undefined ? (wordParams.is_active ? 1 : 0) : 1,
        now,
      )
      const word = selectStmt.get(result.lastInsertRowid) as SensitiveWord
      createdWords.push(word)
    }

    return createdWords
  })
}

export async function deactivateOldVersions(keepVersions: number = 2): Promise<number> {
  const currentVersion = await getCurrentVersion()
  const minVersionToKeep = currentVersion - keepVersions + 1
  return transaction((tx) => {
    const stmt = tx.prepare(`
      UPDATE sensitive_words
      SET is_active = 0
      WHERE version < ?
    `)
    const result = stmt.run(minVersionToKeep)
    return result.changes
  })
}

export async function update(id: number, params: UpdateSensitiveWordParams): Promise<SensitiveWord | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.word !== undefined) {
      fields.push('word = ?')
      values.push(params.word)
    }
    if (params.category !== undefined) {
      fields.push('category = ?')
      values.push(params.category)
    }
    if (params.version !== undefined) {
      fields.push('version = ?')
      values.push(params.version)
    }
    if (params.is_active !== undefined) {
      fields.push('is_active = ?')
      values.push(params.is_active ? 1 : 0)
    }

    const selectStmt = tx.prepare(`
      SELECT id, word, category, version, is_active, created_at
      FROM sensitive_words
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as SensitiveWord | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE sensitive_words
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as SensitiveWord | null
  })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM sensitive_words WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  getCurrentVersion,
  getActiveWordsByVersion,
  getActiveWords,
  findByCategory,
  findByVersion,
  findActive,
  findByWord,
  createNewVersion,
  deactivateOldVersions,
  update,
  remove,
}
