import db, { transaction } from '../db/index.js'
import type { PublishRecord, PublishStatus, ScheduleStatus, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreatePublishRecordParams {
  schedule_id: number
  status?: PublishStatus
  result?: string
  withdraw_reason?: string
  publish_time?: string
}

export interface UpdatePublishRecordParams {
  status?: PublishStatus
  result?: string
  withdraw_reason?: string
  publish_time?: string
}

export async function create(params: CreatePublishRecordParams): Promise<PublishRecord> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO publish_records (schedule_id, status, result, withdraw_reason, publish_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.schedule_id,
      params.status || 'pending',
      params.result || null,
      params.withdraw_reason || null,
      params.publish_time || null,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
      FROM publish_records
      WHERE id = ?
    `)
    return selectStmt.get(id) as PublishRecord
  })
}

export async function findById(id: number, includeRelations = false): Promise<PublishRecord | null> {
  let sql = `
    SELECT pr.id, pr.schedule_id, pr.status, pr.result, pr.withdraw_reason, pr.publish_time, pr.created_at
  `
  if (includeRelations) {
    sql += `,
      s.id as 'schedule.id', s.content_id as 'schedule.content_id', s.channel_id as 'schedule.channel_id',
      s.schedule_time as 'schedule.schedule_time', s.status as 'schedule.status',
      s.created_at as 'schedule.created_at', s.updated_at as 'schedule.updated_at'
    FROM publish_records pr
    LEFT JOIN schedules s ON pr.schedule_id = s.id
    WHERE pr.id = ?
  `
  } else {
    sql += ' FROM publish_records pr WHERE pr.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: PublishRecord = {
      id: result.id as number,
      schedule_id: result.schedule_id as number,
      status: result.status as unknown as PublishStatus,
      result: result.result as string | null,
      withdraw_reason: result.withdraw_reason as string | null,
      publish_time: result.publish_time as string | null,
      created_at: result.created_at as string,
    }
    if (result['schedule.id']) {
      record.schedule = {
        id: result['schedule.id'] as number,
        content_id: result['schedule.content_id'] as number,
        channel_id: result['schedule.channel_id'] as number,
        schedule_time: result['schedule.schedule_time'] as string,
        status: result['schedule.status'] as unknown as ScheduleStatus,
        created_at: result['schedule.created_at'] as string,
        updated_at: result['schedule.updated_at'] as string,
      }
    }
    return record
  }

  return result as unknown as PublishRecord
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM publish_records')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function findByScheduleId(
  scheduleId: number,
  params?: PaginationParams,
): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM publish_records WHERE schedule_id = ?')
  const { total } = countStmt.get(scheduleId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    WHERE schedule_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(scheduleId, pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function findByDateRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM publish_records WHERE created_at >= ? AND created_at <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function findByStatus(
  status: PublishStatus,
  params?: PaginationParams,
): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM publish_records WHERE status = ?')
  const { total } = countStmt.get(status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(status, pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function findByChannelId(
  channelId: number,
  params?: PaginationParams,
): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total 
    FROM publish_records pr
    INNER JOIN schedules s ON pr.schedule_id = s.id
    WHERE s.channel_id = ?
  `)
  const { total } = countStmt.get(channelId) as { total: number }

  const stmt = db.prepare(`
    SELECT pr.id, pr.schedule_id, pr.status, pr.result, pr.withdraw_reason, pr.publish_time, pr.created_at
    FROM publish_records pr
    INNER JOIN schedules s ON pr.schedule_id = s.id
    WHERE s.channel_id = ?
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(channelId, pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function findByPublishTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<PublishRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM publish_records WHERE publish_time >= ? AND publish_time <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    WHERE publish_time >= ? AND publish_time <= ?
    ORDER BY publish_time DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as PublishRecord[]

  return { items, total, page, pageSize }
}

export async function getLatestByScheduleId(scheduleId: number): Promise<PublishRecord | null> {
  const stmt = db.prepare(`
    SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
    FROM publish_records
    WHERE schedule_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return stmt.get(scheduleId) as PublishRecord | null
}

export async function countByScheduleId(scheduleId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM publish_records WHERE schedule_id = ?')
  const result = stmt.get(scheduleId) as { count: number }
  return result.count
}

export async function countByStatus(status: PublishStatus): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM publish_records WHERE status = ?')
  const result = stmt.get(status) as { count: number }
  return result.count
}

export async function getSuccessRateByDateRange(startTime: string, endTime: string): Promise<number> {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count
    FROM publish_records
    WHERE created_at >= ? AND created_at <= ?
  `)
  const result = stmt.get(startTime, endTime) as { total: number; success_count: number }
  return result.total > 0 ? result.success_count / result.total : 0
}

export async function update(id: number, params: UpdatePublishRecordParams): Promise<PublishRecord | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.status !== undefined) {
      fields.push('status = ?')
      values.push(params.status)
    }
    if (params.result !== undefined) {
      fields.push('result = ?')
      values.push(params.result)
    }
    if (params.withdraw_reason !== undefined) {
      fields.push('withdraw_reason = ?')
      values.push(params.withdraw_reason)
    }
    if (params.publish_time !== undefined) {
      fields.push('publish_time = ?')
      values.push(params.publish_time)
    }

    const selectStmt = tx.prepare(`
      SELECT id, schedule_id, status, result, withdraw_reason, publish_time, created_at
      FROM publish_records
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as PublishRecord | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE publish_records
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as PublishRecord | null
  })
}

export async function updateStatus(id: number, status: PublishStatus, result?: string): Promise<PublishRecord | null> {
  return update(id, { status, result })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM publish_records WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  findByScheduleId,
  findByDateRange,
  findByStatus,
  findByChannelId,
  findByPublishTimeRange,
  getLatestByScheduleId,
  countByScheduleId,
  countByStatus,
  getSuccessRateByDateRange,
  update,
  updateStatus,
  remove,
}
