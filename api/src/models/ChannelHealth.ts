import db, { transaction } from '../db/index.js'
import type { ChannelHealth, RateLimitStatus, PaginationParams, PaginationResult, Channel } from '../../../shared/types.js'

interface ChannelHealthRow {
  id: number
  channel_id: number
  success_rate: number
  last_failure_reason: string | null
  rate_limit_status: RateLimitStatus
  responsible_person: string | null
  updated_at: string
  c_id?: number | null
  c_name?: string | null
  c_type?: string | null
  c_status?: string | null
  c_config?: string | null
  channel?: Channel
}

export interface CreateChannelHealthParams {
  channel_id: number
  success_rate?: number
  last_failure_reason?: string | null
  rate_limit_status?: RateLimitStatus
  responsible_person?: string | null
}

export interface UpdateChannelHealthParams {
  success_rate?: number
  last_failure_reason?: string | null
  rate_limit_status?: RateLimitStatus
  responsible_person?: string | null
}

const CHANNEL_FIELDS = `
  ch.id, ch.channel_id, ch.success_rate, ch.last_failure_reason,
  ch.rate_limit_status, ch.responsible_person, ch.updated_at
`

const CHANNEL_JOIN = `
  LEFT JOIN channels c ON ch.channel_id = c.id
`

function mapRow(row: unknown): ChannelHealth {
  if (!row) return row as ChannelHealth
  const r = row as ChannelHealthRow
  const { c_id, c_name, c_type, c_status, c_config, ...health } = r
  if (c_id !== null && c_id !== undefined) {
    health.channel = {
      id: c_id,
      name: c_name ?? '',
      type: c_type ?? '',
      status: (c_status ?? 'active') as 'active' | 'inactive',
      config: c_config ?? null,
    }
  }
  return health as ChannelHealth
}

export async function create(params: CreateChannelHealthParams): Promise<ChannelHealth> {
  return transaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO channel_health (channel_id, success_rate, last_failure_reason, rate_limit_status, responsible_person, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    const result = stmt.run(
      params.channel_id,
      params.success_rate ?? 1.0,
      params.last_failure_reason ?? null,
      params.rate_limit_status ?? 'normal',
      params.responsible_person ?? null,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT ${CHANNEL_FIELDS}, c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config
      FROM channel_health ch
      ${CHANNEL_JOIN}
      WHERE ch.id = ?
    `)
    return mapRow(selectStmt.get(id))
  })
}

export async function findById(id: number, withChannel = true): Promise<ChannelHealth | null> {
  const join = withChannel ? CHANNEL_JOIN : ''
  const channelCols = withChannel ? ', c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config' : ''
  const stmt = db.prepare(`
    SELECT ${CHANNEL_FIELDS}${channelCols}
    FROM channel_health ch
    ${join}
    WHERE ch.id = ?
  `)
  return mapRow(stmt.get(id))
}

export async function findByChannelId(channelId: number): Promise<ChannelHealth | null> {
  const stmt = db.prepare(`
    SELECT ${CHANNEL_FIELDS}, c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config
    FROM channel_health ch
    ${CHANNEL_JOIN}
    WHERE ch.channel_id = ?
  `)
  return mapRow(stmt.get(channelId))
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<ChannelHealth>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM channel_health')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT ${CHANNEL_FIELDS}, c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config
    FROM channel_health ch
    ${CHANNEL_JOIN}
    ORDER BY ch.id ASC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(pageSize, offset) as ChannelHealthRow[]
  const items = rows.map(mapRow)

  return { items, total, page, pageSize }
}

export async function update(id: number, params: UpdateChannelHealthParams): Promise<ChannelHealth | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | null | undefined)[] = []

    if (params.success_rate !== undefined) {
      fields.push('success_rate = ?')
      values.push(params.success_rate)
    }
    if (params.last_failure_reason !== undefined) {
      fields.push('last_failure_reason = ?')
      values.push(params.last_failure_reason ?? null)
    }
    if (params.rate_limit_status !== undefined) {
      fields.push('rate_limit_status = ?')
      values.push(params.rate_limit_status)
    }
    if (params.responsible_person !== undefined) {
      fields.push('responsible_person = ?')
      values.push(params.responsible_person ?? null)
    }

    const selectStmt = tx.prepare(`
      SELECT ${CHANNEL_FIELDS}, c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config
      FROM channel_health ch
      ${CHANNEL_JOIN}
      WHERE ch.id = ?
    `)

    if (fields.length === 0) {
      return mapRow(selectStmt.get(id))
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    const stmt = tx.prepare(`
      UPDATE channel_health
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return mapRow(selectStmt.get(id))
  })
}

export async function updateByChannelId(channelId: number, params: UpdateChannelHealthParams): Promise<ChannelHealth | null> {
  const health = await findByChannelId(channelId)
  if (!health) return null
  return update(health.id, params)
}

export async function recalculate(channelId: number): Promise<ChannelHealth | null> {
  return transaction((tx) => {
    const statsStmt = tx.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pr.status = 'success' THEN 1 ELSE 0 END) as success_count
      FROM publish_records pr
      JOIN schedules s ON pr.schedule_id = s.id
      WHERE s.channel_id = ?
    `)
    const stats = statsStmt.get(channelId) as { total: number; success_count: number }

    const successRate = stats.total > 0 ? stats.success_count / stats.total : 1.0

    const failureStmt = tx.prepare(`
      SELECT pr.result
      FROM publish_records pr
      JOIN schedules s ON pr.schedule_id = s.id
      WHERE s.channel_id = ? AND pr.status = 'failed'
      ORDER BY pr.created_at DESC
      LIMIT 1
    `)
    const failure = failureStmt.get(channelId) as { result: string | null } | undefined
    const lastFailureReason = failure?.result ?? null

    const updateStmt = tx.prepare(`
      UPDATE channel_health
      SET success_rate = ?, last_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE channel_id = ?
    `)
    updateStmt.run(successRate, lastFailureReason, channelId)

    const selectStmt = tx.prepare(`
      SELECT ${CHANNEL_FIELDS}, c.id as c_id, c.name as c_name, c.type as c_type, c.status as c_status, c.config as c_config
      FROM channel_health ch
      ${CHANNEL_JOIN}
      WHERE ch.channel_id = ?
    `)
    return mapRow(selectStmt.get(channelId))
  })
}

export async function countByRateLimitStatus(status: RateLimitStatus): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM channel_health WHERE rate_limit_status = ?')
  const result = stmt.get(status) as { count: number }
  return result.count
}

export default {
  create,
  findById,
  findByChannelId,
  findAll,
  update,
  updateByChannelId,
  recalculate,
  countByRateLimitStatus,
}
