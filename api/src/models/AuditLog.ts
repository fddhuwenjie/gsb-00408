import db, { transaction } from '../db/index.js'
import type { AuditLog, PaginationParams, PaginationResult, UserRole } from '../../../shared/types.js'

export interface CreateAuditLogParams {
  operator_id?: number | null
  action: string
  target_type: string
  target_id?: number | null
  detail?: unknown
}

const AUDIT_FIELDS = `
  al.id, al.operator_id, al.action, al.target_type, al.target_id, al.detail, al.created_at
`

function mapRow(row: unknown): AuditLog {
  if (!row) return row as AuditLog
  const r = row as Record<string, unknown>
  const log: AuditLog = {
    id: r.id as number,
    operator_id: (r.operator_id as number | null) ?? null,
    action: r.action as string,
    target_type: r.target_type as string,
    target_id: (r.target_id as number | null) ?? null,
    detail: (r.detail as string | null) ?? null,
    created_at: r.created_at as string,
  }
  if (r['operator.id']) {
    log.operator = {
      id: r['operator.id'] as number,
      username: r['operator.username'] as string,
      role: r['operator.role'] as UserRole,
      created_at: r['operator.created_at'] as string,
    }
  }
  return log
}

export async function create(params: CreateAuditLogParams): Promise<AuditLog> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const detail =
      params.detail === undefined || params.detail === null
        ? null
        : typeof params.detail === 'string'
          ? params.detail
          : JSON.stringify(params.detail)
    const stmt = tx.prepare(`
      INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.operator_id ?? null,
      params.action,
      params.target_type,
      params.target_id ?? null,
      detail,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT ${AUDIT_FIELDS}
      FROM audit_logs al
      WHERE al.id = ?
    `)
    return mapRow(selectStmt.get(id))
  })
}

export async function findById(id: number, includeRelations = false): Promise<AuditLog | null> {
  let sql = `SELECT ${AUDIT_FIELDS}`
  if (includeRelations) {
    sql += `,
      u.id as 'operator.id', u.username as 'operator.username', u.role as 'operator.role', u.created_at as 'operator.created_at'
    FROM audit_logs al
    LEFT JOIN users u ON al.operator_id = u.id
    WHERE al.id = ?
  `
  } else {
    sql += ' FROM audit_logs al WHERE al.id = ?'
  }
  const stmt = db.prepare(sql)
  return mapRow(stmt.get(id))
}

export async function findAll(
  params?: PaginationParams & { action?: string; target_type?: string; target_id?: number; operator_id?: number },
): Promise<PaginationResult<AuditLog>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 20
  const offset = (page - 1) * pageSize

  const filters: string[] = []
  const values: (string | number)[] = []
  if (params?.action) {
    filters.push('al.action = ?')
    values.push(params.action)
  }
  if (params?.target_type) {
    filters.push('al.target_type = ?')
    values.push(params.target_type)
  }
  if (params?.target_id !== undefined) {
    filters.push('al.target_id = ?')
    values.push(params.target_id)
  }
  if (params?.operator_id !== undefined) {
    filters.push('al.operator_id = ?')
    values.push(params.operator_id)
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs al ${where}`)
  const { total } = countStmt.get(...values) as { total: number }

  const stmt = db.prepare(`
    SELECT ${AUDIT_FIELDS},
      u.id as 'operator.id', u.username as 'operator.username', u.role as 'operator.role', u.created_at as 'operator.created_at'
    FROM audit_logs al
    LEFT JOIN users u ON al.operator_id = u.id
    ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(...values, pageSize, offset) as unknown[]
  const items = rows.map(mapRow)

  return { items, total, page, pageSize }
}

export default {
  create,
  findById,
  findAll,
}
