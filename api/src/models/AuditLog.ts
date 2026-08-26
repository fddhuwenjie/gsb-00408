import db, { transaction } from '../db/index.js'
import type { AuditLog, AuditAction, PaginationParams, PaginationResult } from '../../../shared/types.js'

interface AuditLogRow {
  id: number
  operator_id: number | null
  action: AuditAction
  resource_type: string
  resource_id: number | null
  detail: string | null
  ip_address: string | null
  created_at: string
  u_id?: number | null
  u_username?: string | null
  u_role?: string | null
  u_created_at?: string | null
}

export interface CreateAuditLogParams {
  operator_id?: number | null
  action: AuditAction
  resource_type: string
  resource_id?: number | null
  detail?: string | null
  ip_address?: string | null
}

const FIELDS = `
  al.id, al.operator_id, al.action, al.resource_type, al.resource_id,
  al.detail, al.ip_address, al.created_at
`

const USER_JOIN = `
  LEFT JOIN users u ON al.operator_id = u.id
`

function mapRow(row: unknown): AuditLog {
  if (!row) return row as AuditLog
  const r = row as AuditLogRow
  const { u_id, u_username, u_role, u_created_at, ...rest } = r
  const log = rest as unknown as AuditLog
  if (u_id !== null && u_id !== undefined) {
    log.operator = {
      id: u_id,
      username: u_username ?? '',
      role: (u_role ?? 'editor') as import('../../../shared/types.js').UserRole,
      created_at: u_created_at ?? '',
    }
  }
  return log
}

export async function create(params: CreateAuditLogParams): Promise<AuditLog> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO audit_logs (operator_id, action, resource_type, resource_id, detail, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.operator_id ?? null,
      params.action,
      params.resource_type,
      params.resource_id ?? null,
      params.detail ?? null,
      params.ip_address ?? null,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT ${FIELDS}, u.id as u_id, u.username as u_username, u.role as u_role, u.created_at as u_created_at
      FROM audit_logs al
      ${USER_JOIN}
      WHERE al.id = ?
    `)
    return mapRow(selectStmt.get(id))
  })
}

export async function findById(id: number): Promise<AuditLog | null> {
  const stmt = db.prepare(`
    SELECT ${FIELDS}, u.id as u_id, u.username as u_username, u.role as u_role, u.created_at as u_created_at
    FROM audit_logs al
    ${USER_JOIN}
    WHERE al.id = ?
  `)
  return mapRow(stmt.get(id))
}

export async function findAll(params?: PaginationParams & {
  action?: AuditAction
  resource_type?: string
  operator_id?: number
}): Promise<PaginationResult<AuditLog>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 20
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const values: (string | number)[] = []

  if (params?.action) {
    conditions.push('al.action = ?')
    values.push(params.action)
  }
  if (params?.resource_type) {
    conditions.push('al.resource_type = ?')
    values.push(params.resource_type)
  }
  if (params?.operator_id) {
    conditions.push('al.operator_id = ?')
    values.push(params.operator_id)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`)
  const { total } = countStmt.get(...values) as { total: number }

  const stmt = db.prepare(`
    SELECT ${FIELDS}, u.id as u_id, u.username as u_username, u.role as u_role, u.created_at as u_created_at
    FROM audit_logs al
    ${USER_JOIN}
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(...values, pageSize, offset) as AuditLogRow[]
  const items = rows.map(mapRow)

  return { items, total, page, pageSize }
}

export async function findByResource(
  resourceType: string,
  resourceId: number,
  params?: PaginationParams,
): Promise<PaginationResult<AuditLog>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 20
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM audit_logs WHERE resource_type = ? AND resource_id = ?'
  )
  const { total } = countStmt.get(resourceType, resourceId) as { total: number }

  const stmt = db.prepare(`
    SELECT ${FIELDS}, u.id as u_id, u.username as u_username, u.role as u_role, u.created_at as u_created_at
    FROM audit_logs al
    ${USER_JOIN}
    WHERE al.resource_type = ? AND al.resource_id = ?
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(resourceType, resourceId, pageSize, offset) as AuditLogRow[]
  const items = rows.map(mapRow)

  return { items, total, page, pageSize }
}

export default {
  create,
  findById,
  findAll,
  findByResource,
}
