import db, { transaction } from '../db/index.js'
import type { Schedule, ScheduleStatus, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateScheduleParams {
  content_id: number
  channel_id: number
  schedule_time: string
  status?: ScheduleStatus
}

export interface UpdateScheduleParams {
  channel_id?: number
  schedule_time?: string
  status?: ScheduleStatus
}

export async function create(params: CreateScheduleParams): Promise<Schedule> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO schedules (content_id, channel_id, schedule_time, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.content_id,
      params.channel_id,
      params.schedule_time,
      params.status || 'pending',
      now,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
      FROM schedules
      WHERE id = ?
    `)
    return selectStmt.get(id) as Schedule
  })
}

export async function findById(id: number, includeRelations = false): Promise<Schedule | null> {
  let sql = `
    SELECT s.id, s.content_id, s.channel_id, s.schedule_time, s.status, s.created_at, s.updated_at
  `
  if (includeRelations) {
    sql += `,
      c.id as 'content.id', c.creator_id as 'content.creator_id', c.type as 'content.type', c.title as 'content.title',
      c.content as 'content.content', c.thumbnail_url as 'content.thumbnail_url', c.status as 'content.status',
      c.scan_version as 'content.scan_version', c.created_at as 'content.created_at', c.updated_at as 'content.updated_at',
      ch.id as 'channel.id', ch.name as 'channel.name', ch.type as 'channel.type', ch.status as 'channel.status', ch.config as 'channel.config'
    FROM schedules s
    LEFT JOIN contents c ON s.content_id = c.id
    LEFT JOIN channels ch ON s.channel_id = ch.id
    WHERE s.id = ?
  `
  } else {
    sql += ' FROM schedules s WHERE s.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const schedule: Schedule = {
      id: result.id as number,
      content_id: result.content_id as number,
      channel_id: result.channel_id as number,
      schedule_time: result.schedule_time as string,
      status: result.status as unknown as 'pending' | 'approved' | 'rejected' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'withdrawn',
      created_at: result.created_at as string,
      updated_at: result.updated_at as string,
    }
    if (result['content.id']) {
      schedule.content = {
        id: result['content.id'] as number,
        creator_id: result['content.creator_id'] as number,
        type: result['content.type'] as unknown as 'article' | 'video' | 'poster',
        title: result['content.title'] as string,
        content: result['content.content'] as string,
        thumbnail_url: result['content.thumbnail_url'] as string | null,
        status: result['content.status'] as unknown as 'draft' | 'pending_review' | 'review_approved' | 'review_rejected' | 'scheduled' | 'published' | 'withdrawn',
        scan_version: result['content.scan_version'] as number,
        created_at: result['content.created_at'] as string,
        updated_at: result['content.updated_at'] as string,
      }
    }
    if (result['channel.id']) {
      schedule.channel = {
        id: result['channel.id'] as number,
        name: result['channel.name'] as string,
        type: result['channel.type'] as string,
        status: result['channel.status'] as unknown as 'active' | 'inactive',
        config: result['channel.config'] as string | null,
      }
    }
    return schedule
  }

  return result as unknown as Schedule
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM schedules')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    ORDER BY schedule_time DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function findByStatus(status: ScheduleStatus, params?: PaginationParams): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM schedules WHERE status = ?')
  const { total } = countStmt.get(status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE status = ?
    ORDER BY schedule_time DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(status, pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function findByChannelIdAndTimeRange(
  channelId: number,
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM schedules WHERE channel_id = ? AND schedule_time >= ? AND schedule_time <= ?',
  )
  const { total } = countStmt.get(channelId, startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE channel_id = ? AND schedule_time >= ? AND schedule_time <= ?
    ORDER BY schedule_time ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(channelId, startTime, endTime, pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function findByContentId(contentId: number, params?: PaginationParams): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM schedules WHERE content_id = ?')
  const { total } = countStmt.get(contentId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE content_id = ?
    ORDER BY schedule_time DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(contentId, pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function findPendingSchedules(params?: PaginationParams): Promise<PaginationResult<Schedule>> {
  return findByStatus('pending', params)
}

export async function findByTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM schedules WHERE schedule_time >= ? AND schedule_time <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE schedule_time >= ? AND schedule_time <= ?
    ORDER BY schedule_time ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function findScheduledToPublish(beforeTime: string, params?: PaginationParams): Promise<PaginationResult<Schedule>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM schedules WHERE status = ? AND schedule_time <= ?',
  )
  const { total } = countStmt.get('scheduled', beforeTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE status = ? AND schedule_time <= ?
    ORDER BY schedule_time ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all('scheduled', beforeTime, pageSize, offset) as Schedule[]

  return { items, total, page, pageSize }
}

export async function update(id: number, params: UpdateScheduleParams): Promise<Schedule | null> {
  return transaction((tx) => {
    const fields: string[] = ['updated_at = ?']
    const values: (string | number | boolean | null | undefined)[] = [new Date().toISOString()]

    if (params.channel_id !== undefined) {
      fields.push('channel_id = ?')
      values.push(params.channel_id)
    }
    if (params.schedule_time !== undefined) {
      fields.push('schedule_time = ?')
      values.push(params.schedule_time)
    }
    if (params.status !== undefined) {
      fields.push('status = ?')
      values.push(params.status)
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE schedules
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    
    const selectStmt = tx.prepare(`
      SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
      FROM schedules
      WHERE id = ?
    `)
    return selectStmt.get(id) as Schedule | null
  })
}

export async function updateStatus(id: number, status: ScheduleStatus): Promise<Schedule | null> {
  return update(id, { status })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM schedules WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  findByStatus,
  findByChannelIdAndTimeRange,
  findByContentId,
  findPendingSchedules,
  findByTimeRange,
  findScheduledToPublish,
  update,
  updateStatus,
  remove,
}
