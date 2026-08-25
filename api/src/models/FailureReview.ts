import db, { transaction } from '../db/index.js'
import type { FailureReview, FailureReviewStatus, FailureReviewAction, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateFailureReviewParams {
  publish_record_id: number
  schedule_id: number
  handler_id?: number | null
  conclusion?: string | null
  action_type?: FailureReviewAction | null
  status?: FailureReviewStatus
}

export interface UpdateFailureReviewParams {
  handler_id?: number | null
  conclusion?: string | null
  action_type?: FailureReviewAction | null
  status?: FailureReviewStatus
  resolved_at?: string | null
}

export async function create(params: CreateFailureReviewParams): Promise<FailureReview> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO failure_reviews (publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.publish_record_id,
      params.schedule_id,
      params.handler_id ?? null,
      params.conclusion ?? null,
      params.action_type ?? null,
      params.status || 'pending',
      now,
      null,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
      FROM failure_reviews
      WHERE id = ?
    `)
    return selectStmt.get(id) as FailureReview
  })
}

export async function findById(id: number, includeRelations = false): Promise<FailureReview | null> {
  let sql = `
    SELECT fr.id, fr.publish_record_id, fr.schedule_id, fr.handler_id, fr.conclusion, fr.action_type, fr.status, fr.created_at, fr.resolved_at
  `
  if (includeRelations) {
    sql += `,
      u.id as 'handler.id', u.username as 'handler.username', u.email as 'handler.email', u.role as 'handler.role', u.created_at as 'handler.created_at',
      pr.id as 'publish_record.id', pr.schedule_id as 'publish_record.schedule_id', pr.status as 'publish_record.status',
      pr.result as 'publish_record.result', pr.withdraw_reason as 'publish_record.withdraw_reason',
      pr.publish_time as 'publish_record.publish_time', pr.created_at as 'publish_record.created_at'
    FROM failure_reviews fr
    LEFT JOIN users u ON fr.handler_id = u.id
    LEFT JOIN publish_records pr ON fr.publish_record_id = pr.id
    WHERE fr.id = ?
  `
  } else {
    sql += ' FROM failure_reviews fr WHERE fr.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: FailureReview = {
      id: result.id as number,
      publish_record_id: result.publish_record_id as number,
      schedule_id: result.schedule_id as number,
      handler_id: result.handler_id as number | null,
      conclusion: result.conclusion as string | null,
      action_type: result.action_type as FailureReviewAction | null,
      status: result.status as unknown as FailureReviewStatus,
      created_at: result.created_at as string,
      resolved_at: result.resolved_at as string | null,
    }
    if (result['handler.id']) {
      record.handler = {
        id: result['handler.id'] as number,
        username: result['handler.username'] as string,
        role: result['handler.role'] as unknown as import('../../../shared/types.js').UserRole,
        created_at: result['handler.created_at'] as string,
      }
    }
    if (result['publish_record.id']) {
      record.publish_record = {
        id: result['publish_record.id'] as number,
        schedule_id: result['publish_record.schedule_id'] as number,
        status: result['publish_record.status'] as unknown as import('../../../shared/types.js').PublishStatus,
        result: result['publish_record.result'] as string | null,
        withdraw_reason: result['publish_record.withdraw_reason'] as string | null,
        publish_time: result['publish_record.publish_time'] as string | null,
        created_at: result['publish_record.created_at'] as string,
      }
    }
    return record
  }

  return result as unknown as FailureReview
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<FailureReview>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM failure_reviews')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
    FROM failure_reviews
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as FailureReview[]

  return { items, total, page, pageSize }
}

export async function findByStatus(
  status: FailureReviewStatus,
  params?: PaginationParams,
): Promise<PaginationResult<FailureReview>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM failure_reviews WHERE status = ?')
  const { total } = countStmt.get(status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
    FROM failure_reviews
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(status, pageSize, offset) as FailureReview[]

  return { items, total, page, pageSize }
}

export async function findByScheduleId(
  scheduleId: number,
  params?: PaginationParams,
): Promise<PaginationResult<FailureReview>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM failure_reviews WHERE schedule_id = ?')
  const { total } = countStmt.get(scheduleId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
    FROM failure_reviews
    WHERE schedule_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(scheduleId, pageSize, offset) as FailureReview[]

  return { items, total, page, pageSize }
}

export async function findByPublishRecordId(publishRecordId: number): Promise<FailureReview | null> {
  const stmt = db.prepare(`
    SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
    FROM failure_reviews
    WHERE publish_record_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(publishRecordId) as FailureReview | null
}

export async function findPendingByScheduleId(scheduleId: number): Promise<FailureReview | null> {
  const stmt = db.prepare(`
    SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
    FROM failure_reviews
    WHERE schedule_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(scheduleId) as FailureReview | null
}

export async function update(id: number, params: UpdateFailureReviewParams): Promise<FailureReview | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.handler_id !== undefined) {
      fields.push('handler_id = ?')
      values.push(params.handler_id)
    }
    if (params.conclusion !== undefined) {
      fields.push('conclusion = ?')
      values.push(params.conclusion)
    }
    if (params.action_type !== undefined) {
      fields.push('action_type = ?')
      values.push(params.action_type)
    }
    if (params.status !== undefined) {
      fields.push('status = ?')
      values.push(params.status)
    }
    if (params.resolved_at !== undefined) {
      fields.push('resolved_at = ?')
      values.push(params.resolved_at)
    }

    const selectStmt = tx.prepare(`
      SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, created_at, resolved_at
      FROM failure_reviews
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as FailureReview | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE failure_reviews
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as FailureReview | null
  })
}

export async function resolve(
  id: number,
  handlerId: number,
  conclusion: string,
  actionType: FailureReviewAction,
): Promise<FailureReview | null> {
  return update(id, {
    handler_id: handlerId,
    conclusion,
    action_type: actionType,
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  })
}

export async function countPendingByScheduleId(scheduleId: number): Promise<number> {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM failure_reviews WHERE schedule_id = ? AND status = 'pending'")
  const result = stmt.get(scheduleId) as { count: number }
  return result.count
}

export default {
  create,
  findById,
  findAll,
  findByStatus,
  findByScheduleId,
  findByPublishRecordId,
  findPendingByScheduleId,
  update,
  resolve,
  countPendingByScheduleId,
}
