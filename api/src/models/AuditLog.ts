import db, { transaction } from '../db/index.js'
import type { AuditLog, PaginationParams, PaginationResult, UserRole } from '../../../shared/types.js'

interface AuditLogRow {
  id: number
  operator_id: number | null
  action: string
  target_type: string
  target_id: number | null
  detail: string | null
  created_at: string
  o_id?: number | null
  o_username?: string | null
  o_role?: string | null
  o_created_at?: string | null
}

export interface CreateAuditLogParams {
  operator_id: number | null
  action: string
  target_type: string
  target_id?: number | null
  detail?: string | Record<string, unknown> | null
}

const BASE_FIELDS = `
  al.id, al.operator_id, al.action, al.target_type, al.target_id, al.detail, al.created_at
`

const OPERATOR_JOIN = `LEFT JOIN users u ON al.operator_id = u.id`
const OPERATOR_COLS = `, u.id as o_id, u.username as o_username, u.role as o_role, u.created_at as o_created_at`

function mapRow(row: unknown): AuditLog {
  if (!row) return row as AuditLog
  const r = row as AuditLogRow
  const { o_id, o_username, o_role, o_created_at, ...log } = r
  const result = log as AuditLog
  if (o_id !== null && o_id !== undefined) {
    result.operator = {
      id: o_id,
      username: o_username ?? '',
      role: (o_role ?? 'editor') as UserRole,
      created_at: o_created_at ?? '',
    }
  }
  return result
}

function normalizeDetail(detail: CreateAuditLogParams['detail']): string | null {
  if (detail === undefined || detail === null) return null
  if (typeof detail === 'string') return detail
  return JSON.stringify(detail)
}

export async function create(params: CreateAuditLogParams): Promise<AuditLog> {
  return transaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    const result = stmt.run(
      params.operator_id ?? null,
      params.action,
      params.target_type,
      params.target_id ?? null,
      normalizeDetail(params.detail),
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT ${BASE_FIELDS}${OPERATOR_COLS}
      FROM audit_logs al
      ${OPERATOR_JOIN}
      WHERE al.id = ?
    `)
    return mapRow(selectStmt.get(id))
  })
}

export async function findAll(
  params?: PaginationParams & {
    target_type?: string
    target_id?: number
    operator_id?: number
    action?: string
  },
): Promise<PaginationResult<AuditLog>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 20
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const values: (string | number)[] = []

  if (params?.target_type) {
    conditions.push('al.target_type = ?')
    values.push(params.target_type)
  }
  if (params?.target_id !== undefined) {
    conditions.push('al.target_id = ?')
    values.push(params.target_id)
  }
  if (params?.operator_id !== undefined) {
    conditions.push('al.operator_id = ?')
    values.push(params.operator_id)
  }
  if (params?.action) {
    conditions.push('al.action = ?')
    values.push(params.action)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`)
  const { total } = countStmt.get(...values) as { total: number }

  const stmt = db.prepare(`
    SELECT ${BASE_FIELDS}${OPERATOR_COLS}
    FROM audit_logs al
    ${OPERATOR_JOIN}
    ${whereClause}
    ORDER BY al.id DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(...values, pageSize, offset) as AuditLogRow[]

  return { items: rows.map(mapRow), total, page, pageSize }
}

export default {
  create,
  findAll,
}
