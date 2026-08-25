import db, { transaction } from '../db/index.js'
import type { ReviewRecord, ReviewDecision, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateReviewRecordParams {
  content_id: number
  reviewer_id: number
  decision: ReviewDecision
  opinion: string
  opinion_version?: number
}

export interface UpdateReviewRecordParams {
  decision?: ReviewDecision
  opinion?: string
  opinion_version?: number
}

export async function create(params: CreateReviewRecordParams): Promise<ReviewRecord> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO review_records (content_id, reviewer_id, decision, opinion, opinion_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.content_id,
      params.reviewer_id,
      params.decision,
      params.opinion,
      params.opinion_version || 1,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
      FROM review_records
      WHERE id = ?
    `)
    return selectStmt.get(id) as ReviewRecord
  })
}

export async function findById(id: number, includeRelations = false): Promise<ReviewRecord | null> {
  let sql = `
    SELECT rr.id, rr.content_id, rr.reviewer_id, rr.decision, rr.opinion, rr.opinion_version, rr.created_at
  `
  if (includeRelations) {
    sql += `,
      u.id as 'reviewer.id', u.username as 'reviewer.username', u.role as 'reviewer.role', u.created_at as 'reviewer.created_at'
    FROM review_records rr
    LEFT JOIN users u ON rr.reviewer_id = u.id
    WHERE rr.id = ?
  `
  } else {
    sql += ' FROM review_records rr WHERE rr.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: ReviewRecord = {
      id: result.id as number,
      content_id: result.content_id as number,
      reviewer_id: result.reviewer_id as number,
      decision: result.decision as unknown as 'approve' | 'reject',
      opinion: result.opinion as string | null,
      opinion_version: result.opinion_version as number,
      created_at: result.created_at as string,
    }
    if (result['reviewer.id']) {
      record.reviewer = {
        id: result['reviewer.id'] as number,
        username: result['reviewer.username'] as string,
        role: result['reviewer.role'] as unknown as 'editor' | 'reviewer' | 'admin',
        created_at: result['reviewer.created_at'] as string,
      }
    }
    return record
  }

  return result as unknown as ReviewRecord
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_records')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function findByContentId(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_records WHERE content_id = ?')
  const { total } = countStmt.get(contentId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE content_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(contentId, pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function getLatestByContentId(contentId: number): Promise<ReviewRecord | null> {
  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE content_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(contentId) as ReviewRecord | null
}

export async function findByReviewerId(
  reviewerId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_records WHERE reviewer_id = ?')
  const { total } = countStmt.get(reviewerId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE reviewer_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(reviewerId, pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function findByDecision(
  decision: ReviewDecision,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_records WHERE decision = ?')
  const { total } = countStmt.get(decision) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE decision = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(decision, pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function findByTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM review_records WHERE created_at >= ? AND created_at <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function findByReviewerIdAndDecision(
  reviewerId: number,
  decision: ReviewDecision,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM review_records WHERE reviewer_id = ? AND decision = ?',
  )
  const { total } = countStmt.get(reviewerId, decision) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
    FROM review_records
    WHERE reviewer_id = ? AND decision = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(reviewerId, decision, pageSize, offset) as ReviewRecord[]

  return { items, total, page, pageSize }
}

export async function countByContentId(contentId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM review_records WHERE content_id = ?')
  const result = stmt.get(contentId) as { count: number }
  return result.count
}

export async function countByReviewerId(reviewerId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM review_records WHERE reviewer_id = ?')
  const result = stmt.get(reviewerId) as { count: number }
  return result.count
}

export async function update(id: number, params: UpdateReviewRecordParams): Promise<ReviewRecord | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.decision !== undefined) {
      fields.push('decision = ?')
      values.push(params.decision)
    }
    if (params.opinion !== undefined) {
      fields.push('opinion = ?')
      values.push(params.opinion)
    }
    if (params.opinion_version !== undefined) {
      fields.push('opinion_version = ?')
      values.push(params.opinion_version)
    }

    const selectStmt = tx.prepare(`
      SELECT id, content_id, reviewer_id, decision, opinion, opinion_version, created_at
      FROM review_records
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as ReviewRecord | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE review_records
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as ReviewRecord | null
  })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM review_records WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  findByContentId,
  getLatestByContentId,
  findByReviewerId,
  findByDecision,
  findByTimeRange,
  findByReviewerIdAndDecision,
  countByContentId,
  countByReviewerId,
  update,
  remove,
}
