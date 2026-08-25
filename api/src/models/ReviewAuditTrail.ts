import db, { transaction } from '../db/index.js'
import type { ReviewAuditTrail, ReviewAuditAction, ReviewDecision, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateReviewAuditTrailParams {
  review_record_id: number
  operator_id: number
  action: ReviewAuditAction
  previous_decision: ReviewDecision | null
  new_decision: ReviewDecision
  opinion: string
  opinion_version?: number
}

export async function create(params: CreateReviewAuditTrailParams): Promise<ReviewAuditTrail> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const opinionVersion = params.opinion_version ?? 1
    const stmt = tx.prepare(`
      INSERT INTO review_audit_trail (review_record_id, operator_id, action, previous_decision, new_decision, opinion, opinion_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.review_record_id,
      params.operator_id,
      params.action,
      params.previous_decision,
      params.new_decision,
      params.opinion,
      opinionVersion,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, review_record_id, operator_id, action, previous_decision, new_decision, opinion, opinion_version, created_at
      FROM review_audit_trail
      WHERE id = ?
    `)
    return selectStmt.get(id) as ReviewAuditTrail
  })
}

export async function findById(id: number, includeRelations = false): Promise<ReviewAuditTrail | null> {
  let sql = `
    SELECT rat.id, rat.review_record_id, rat.operator_id, rat.action, rat.previous_decision, rat.new_decision, rat.opinion, rat.opinion_version, rat.created_at
  `
  if (includeRelations) {
    sql += `,
      u.id as 'operator.id', u.username as 'operator.username', u.role as 'operator.role', u.created_at as 'operator.created_at'
    FROM review_audit_trail rat
    LEFT JOIN users u ON rat.operator_id = u.id
    WHERE rat.id = ?
  `
  } else {
    sql += ' FROM review_audit_trail rat WHERE rat.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: ReviewAuditTrail = {
      id: result.id as number,
      review_record_id: result.review_record_id as number,
      operator_id: result.operator_id as number,
      action: result.action as ReviewAuditAction,
      previous_decision: result.previous_decision as ReviewDecision | null,
      new_decision: result.new_decision as ReviewDecision,
      opinion: result.opinion as string,
      opinion_version: result.opinion_version as number,
      created_at: result.created_at as string,
    }
    if (result['operator.id']) {
      record.operator = {
        id: result['operator.id'] as number,
        username: result['operator.username'] as string,
        role: result['operator.role'] as unknown as 'editor' | 'reviewer' | 'admin',
        created_at: result['operator.created_at'] as string,
      }
    }
    return record
  }

  return result as unknown as ReviewAuditTrail
}

export async function findByReviewRecordId(
  reviewRecordId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewAuditTrail>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_audit_trail WHERE review_record_id = ?')
  const { total } = countStmt.get(reviewRecordId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, review_record_id, operator_id, action, previous_decision, new_decision, opinion, opinion_version, created_at
    FROM review_audit_trail
    WHERE review_record_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(reviewRecordId, pageSize, offset) as ReviewAuditTrail[]

  return { items, total, page, pageSize }
}

export async function findByOperatorId(
  operatorId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewAuditTrail>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_audit_trail WHERE operator_id = ?')
  const { total } = countStmt.get(operatorId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, review_record_id, operator_id, action, previous_decision, new_decision, opinion, opinion_version, created_at
    FROM review_audit_trail
    WHERE operator_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(operatorId, pageSize, offset) as ReviewAuditTrail[]

  return { items, total, page, pageSize }
}

export async function findByContentId(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewAuditTrail>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM review_audit_trail rat
    JOIN review_records rr ON rat.review_record_id = rr.id
    WHERE rr.content_id = ?
  `)
  const { total } = countStmt.get(contentId) as { total: number }

  const stmt = db.prepare(`
    SELECT rat.id, rat.review_record_id, rat.operator_id, rat.action, rat.previous_decision, rat.new_decision, rat.opinion, rat.opinion_version, rat.created_at
    FROM review_audit_trail rat
    JOIN review_records rr ON rat.review_record_id = rr.id
    WHERE rr.content_id = ?
    ORDER BY rat.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(contentId, pageSize, offset) as ReviewAuditTrail[]

  return { items, total, page, pageSize }
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<ReviewAuditTrail>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM review_audit_trail')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, review_record_id, operator_id, action, previous_decision, new_decision, opinion, opinion_version, created_at
    FROM review_audit_trail
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as ReviewAuditTrail[]

  return { items, total, page, pageSize }
}

export async function countByReviewRecordId(reviewRecordId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM review_audit_trail WHERE review_record_id = ?')
  const result = stmt.get(reviewRecordId) as { count: number }
  return result.count
}

export default {
  create,
  findById,
  findByReviewRecordId,
  findByOperatorId,
  findByContentId,
  findAll,
  countByReviewRecordId,
}
