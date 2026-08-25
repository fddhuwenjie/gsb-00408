import db, { transaction } from '../db/index.js'
import type { ScanRecord, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateScanRecordParams {
  content_id: number
  word_id: number
  version: number
  matched_text: string
  position: number
}

export interface UpdateScanRecordParams {
  handled?: boolean
}

export async function create(params: CreateScanRecordParams): Promise<ScanRecord> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO scan_records (content_id, word_id, version, matched_text, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.content_id,
      params.word_id,
      params.version,
      params.matched_text,
      params.position,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, content_id, word_id, version, matched_text, position, created_at
      FROM scan_records
      WHERE id = ?
    `)
    return selectStmt.get(id) as ScanRecord
  })
}

export async function createBatch(records: CreateScanRecordParams[]): Promise<ScanRecord[]> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const createdRecords: ScanRecord[] = []

    const stmt = tx.prepare(`
      INSERT INTO scan_records (content_id, word_id, version, matched_text, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    for (const record of records) {
      const result = stmt.run(
        record.content_id,
        record.word_id,
        record.version,
        record.matched_text,
        record.position,
        now,
      )
      const createdRecord = tx.prepare(`
        SELECT id, content_id, word_id, version, matched_text, position, created_at
        FROM scan_records
        WHERE id = ?
      `).get(result.lastInsertRowid) as ScanRecord
      createdRecords.push(createdRecord)
    }

    return createdRecords
  })
}

export async function findById(id: number, includeRelations = false): Promise<ScanRecord | null> {
  let sql = `
    SELECT sr.id, sr.content_id, sr.word_id, sr.version, sr.matched_text, sr.position, sr.created_at
  `
  if (includeRelations) {
    sql += `,
      sw.id as 'word.id', sw.word as 'word.word', sw.category as 'word.category', sw.version as 'word.version',
      sw.is_active as 'word.is_active', sw.created_at as 'word.created_at'
    FROM scan_records sr
    LEFT JOIN sensitive_words sw ON sr.word_id = sw.id
    WHERE sr.id = ?
  `
  } else {
    sql += ' FROM scan_records sr WHERE sr.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: ScanRecord = {
      id: result.id as number,
      content_id: result.content_id as number,
      word_id: result.word_id as number,
      version: result.version as number,
      matched_text: result.matched_text as string,
      position: result.position as number,
      created_at: result.created_at as string,
    }
    if (result['word.id']) {
      record.word = {
        id: result['word.id'] as number,
        word: result['word.word'] as string,
        category: result['word.category'] as string,
        version: result['word.version'] as number,
        is_active: result['word.is_active'] === 1,
        created_at: result['word.created_at'] as string,
      }
    }
    return record
  }

  return result as unknown as ScanRecord
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM scan_records')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, word_id, version, matched_text, position, created_at
    FROM scan_records
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function findByContentId(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM scan_records WHERE content_id = ?')
  const { total } = countStmt.get(contentId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, word_id, version, matched_text, position, created_at
    FROM scan_records
    WHERE content_id = ?
    ORDER BY position ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(contentId, pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function findUnhandledByContentId(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM scan_records sr
    WHERE sr.content_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM review_records rr
      WHERE rr.content_id = sr.content_id
    )
  `)
  const { total } = countStmt.get(contentId) as { total: number }

  const stmt = db.prepare(`
    SELECT sr.id, sr.content_id, sr.word_id, sr.version, sr.matched_text, sr.position, sr.created_at
    FROM scan_records sr
    WHERE sr.content_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM review_records rr
      WHERE rr.content_id = sr.content_id
    )
    ORDER BY sr.position ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(contentId, pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function findByWordId(
  wordId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM scan_records WHERE word_id = ?')
  const { total } = countStmt.get(wordId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, word_id, version, matched_text, position, created_at
    FROM scan_records
    WHERE word_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(wordId, pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function findByVersion(version: number, params?: PaginationParams): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM scan_records WHERE version = ?')
  const { total } = countStmt.get(version) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, word_id, version, matched_text, position, created_at
    FROM scan_records
    WHERE version = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(version, pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function findByTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<ScanRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM scan_records WHERE created_at >= ? AND created_at <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, word_id, version, matched_text, position, created_at
    FROM scan_records
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as ScanRecord[]

  return { items, total, page, pageSize }
}

export async function countByContentId(contentId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM scan_records WHERE content_id = ?')
  const result = stmt.get(contentId) as { count: number }
  return result.count
}

export async function countUnhandledByContentId(contentId: number): Promise<number> {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM scan_records sr
    WHERE sr.content_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM review_records rr
      WHERE rr.content_id = sr.content_id
    )
  `)
  const result = stmt.get(contentId) as { count: number }
  return result.count
}

export async function deleteByContentId(contentId: number): Promise<number> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM scan_records WHERE content_id = ?')
    const result = stmt.run(contentId)
    return result.changes
  })
}

export async function update(id: number, params: UpdateScanRecordParams): Promise<ScanRecord | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.handled !== undefined) {
      fields.push('handled = ?')
      values.push(params.handled ? 1 : 0)
    }

    const selectStmt = tx.prepare(`
      SELECT id, content_id, word_id, version, matched_text, position, created_at
      FROM scan_records
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as ScanRecord | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE scan_records
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as ScanRecord | null
  })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM scan_records WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  createBatch,
  findById,
  findAll,
  findByContentId,
  findUnhandledByContentId,
  findByWordId,
  findByVersion,
  findByTimeRange,
  countByContentId,
  countUnhandledByContentId,
  deleteByContentId,
  update,
  remove,
}
