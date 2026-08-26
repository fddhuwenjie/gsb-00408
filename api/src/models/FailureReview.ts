import db, { transaction } from '../db/index.js'
import type { FailureReview, FailureReviewStatus, FailureReviewAction, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateFailureReviewParams {
  publish_record_id?: number | null
  schedule_id: number
  handler_id?: number | null
  conclusion?: string | null
  action_type?: FailureReviewAction | null
  status?: FailureReviewStatus
  reason?: string | null
}

export interface UpdateFailureReviewParams {
  handler_id?: number | null
  conclusion?: string | null
  action_type?: FailureReviewAction | null
  status?: FailureReviewStatus
  resolved_at?: string | null
  reason?: string | null
}

const BASE_FIELDS = `
  fr.id, fr.publish_record_id, fr.schedule_id, fr.handler_id, fr.conclusion,
  fr.action_type, fr.status, fr.reason, fr.created_at, fr.resolved_at
`

export async function create(params: CreateFailureReviewParams): Promise<FailureReview> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO failure_reviews (publish_record_id, schedule_id, handler_id, conclusion, action_type, status, reason, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.publish_record_id ?? null,
      params.schedule_id,
      params.handler_id ?? null,
      params.conclusion ?? null,
      params.action_type ?? null,
      params.status || 'pending',
      params.reason ?? null,
      now,
      null,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT ${BASE_FIELDS}
      FROM failure_reviews fr
      WHERE fr.id = ?
    `)
    return selectStmt.get(id) as FailureReview
  })
}

export async function findById(id: number, includeRelations = false): Promise<FailureReview | null> {
  let sql = `SELECT ${BASE_FIELDS}`
  if (includeRelations) {
    sql += `,
      u.id as 'handler.id', u.username as 'handler.username', u.email as 'handler.email', u.role as 'handler.role', u.created_at as 'handler.created_at',
      pr.id as 'publish_record.id', pr.schedule_id as 'publish_record.schedule_id', pr.status as 'publish_record.status',
      pr.result as 'publish_record.result', pr.withdraw_reason as 'publish_record.withdraw_reason',
      pr.publish_time as 'publish_record.publish_time', pr.created_at as 'publish_record.created_at',
      s.id as 'schedule.id', s.content_id as 'schedule.content_id', s.channel_id as 'schedule.channel_id',
      s.schedule_time as 'schedule.schedule_time', s.status as 'schedule.status',
      s.created_at as 'schedule.created_at', s.updated_at as 'schedule.updated_at',
      c.id as 'content.id', c.title as 'content.title', c.type as 'content.type',
      ch.id as 'channel.id', ch.name as 'channel.name', ch.type as 'channel.type'
    FROM failure_reviews fr
    LEFT JOIN users u ON fr.handler_id = u.id
    LEFT JOIN publish_records pr ON fr.publish_record_id = pr.id
    LEFT JOIN schedules s ON fr.schedule_id = s.id
    LEFT JOIN contents c ON s.content_id = c.id
    LEFT JOIN channels ch ON s.channel_id = ch.id
    WHERE fr.id = ?
  `
  } else {
    sql += ' FROM failure_reviews fr WHERE fr.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    return mapFailureReviewWithRelations(result)
  }

  return result as unknown as FailureReview
}

function mapFailureReviewWithRelations(result: Record<string, unknown>): FailureReview {
  const record: FailureReview = {
    id: result.id as number,
    publish_record_id: result.publish_record_id as number | null,
    schedule_id: result.schedule_id as number,
    handler_id: result.handler_id as number | null,
    conclusion: result.conclusion as string | null,
    action_type: result.action_type as FailureReviewAction | null,
    status: result.status as unknown as FailureReviewStatus,
    reason: result.reason as string | null,
    created_at: result.created_at as string,
    resolved_at: result.resolved_at as string | null,
  }
  if (result['handler.id']) {
    record.handler = {
      id: result['handler.id'] as number,
      username: result['handler.username'] as string,
      role: result['handler.role'] as import('../../../shared/types.js').UserRole,
      created_at: result['handler.created_at'] as string,
    }
  }
  if (result['publish_record.id']) {
    record.publish_record = {
      id: result['publish_record.id'] as number,
      schedule_id: result['publish_record.schedule_id'] as number,
      status: result['publish_record.status'] as import('../../../shared/types.js').PublishStatus,
      result: result['publish_record.result'] as string | null,
      withdraw_reason: result['publish_record.withdraw_reason'] as string | null,
      publish_time: result['publish_record.publish_time'] as string | null,
      created_at: result['publish_record.created_at'] as string,
    }
  }
  if (result['schedule.id']) {
    record.schedule = {
      id: result['schedule.id'] as number,
      content_id: result['schedule.content_id'] as number,
      channel_id: result['schedule.channel_id'] as number,
      schedule_time: result['schedule.schedule_time'] as string,
      status: result['schedule.status'] as import('../../../shared/types.js').ScheduleStatus,
      created_at: result['schedule.created_at'] as string,
      updated_at: result['schedule.updated_at'] as string,
    }
    if (result['content.id']) {
      record.schedule.content = {
        id: result['content.id'] as number,
        creator_id: 0,
        type: result['content.type'] as import('../../../shared/types.js').ContentType,
        title: result['content.title'] as string,
        content: '',
        status: 'draft',
        scan_version: 1,
        created_at: '',
        updated_at: '',
      }
    }
    if (result['channel.id']) {
      record.schedule.channel = {
        id: result['channel.id'] as number,
        name: result['channel.name'] as string,
        type: result['channel.type'] as string,
        status: 'active',
      }
    }
  }
  return record
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<FailureReview>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM failure_reviews')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT ${BASE_FIELDS}
    FROM failure_reviews fr
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
    SELECT ${BASE_FIELDS}
    FROM failure_reviews fr
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
    SELECT ${BASE_FIELDS}
    FROM failure_reviews fr
    WHERE schedule_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(scheduleId, pageSize, offset) as FailureReview[]

  return { items, total, page, pageSize }
}

export async function findByPublishRecordId(publishRecordId: number): Promise<FailureReview | null> {
  const stmt = db.prepare(`
    SELECT ${BASE_FIELDS}
    FROM failure_reviews fr
    WHERE publish_record_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(publishRecordId) as FailureReview | null
}

export async function findPendingByScheduleId(scheduleId: number): Promise<FailureReview | null> {
  const stmt = db.prepare(`
    SELECT ${BASE_FIELDS}
    FROM failure_reviews fr
    WHERE schedule_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(scheduleId) as FailureReview | null
}

export async function findAllPendingWithRelations(params?: PaginationParams): Promise<PaginationResult<FailureReview>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare("SELECT COUNT(*) as total FROM failure_reviews WHERE status = 'pending'")
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT ${BASE_FIELDS},
      u.id as 'handler.id', u.username as 'handler.username', u.role as 'handler.role', u.created_at as 'handler.created_at',
      s.id as 'schedule.id', s.content_id as 'schedule.content_id', s.channel_id as 'schedule.channel_id',
      s.schedule_time as 'schedule.schedule_time', s.status as 'schedule.status',
      s.created_at as 'schedule.created_at', s.updated_at as 'schedule.updated_at',
      c.id as 'content.id', c.title as 'content.title', c.type as 'content.type',
      ch.id as 'channel.id', ch.name as 'channel.name', ch.type as 'channel.type'
    FROM failure_reviews fr
    LEFT JOIN users u ON fr.handler_id = u.id
    LEFT JOIN schedules s ON fr.schedule_id = s.id
    LEFT JOIN contents c ON s.content_id = c.id
    LEFT JOIN channels ch ON s.channel_id = ch.id
    WHERE fr.status = 'pending'
    ORDER BY fr.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(pageSize, offset) as Record<string, unknown>[]
  const items = rows.map(mapFailureReviewWithRelations)

  return { items, total, page, pageSize }
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
    if (params.reason !== undefined) {
      fields.push('reason = ?')
      values.push(params.reason)
    }

    const selectStmt = tx.prepare(`
      SELECT ${BASE_FIELDS}
      FROM failure_reviews fr
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

export async function countPending(): Promise<number> {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM failure_reviews WHERE status = 'pending'")
  const result = stmt.get() as { count: number }
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
  findAllPendingWithRelations,
  update,
  resolve,
  countPendingByScheduleId,
  countPending,
}
