import db, { transaction } from '../db/index.js'
import type {
  AuditRecord,
  AuditAction,
  PaginationParams,
  PaginationResult,
  UserRole,
} from '../../../shared/types.js'

export interface CreateAuditRecordParams {
  operator_id?: number | null
  action: AuditAction
  target_type: 'channel' | 'schedule' | 'failure_review'
  target_id: number
  detail?: string | null
}

export async function create(params: CreateAuditRecordParams): Promise<AuditRecord> {
  return transaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO audit_records (operator_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.operator_id ?? null,
      params.action,
      params.target_type,
      params.target_id,
      params.detail ?? null,
      new Date().toISOString(),
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, operator_id, action, target_type, target_id, detail, created_at
      FROM audit_records
      WHERE id = ?
    `)
    return selectStmt.get(id) as AuditRecord
  })
}

export async function findAll(
  params?: PaginationParams & {
    action?: AuditAction
    target_type?: 'channel' | 'schedule' | 'failure_review'
    target_id?: number
  },
): Promise<PaginationResult<AuditRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const values: (string | number)[] = []

  if (params?.action) {
    conditions.push('a.action = ?')
    values.push(params.action)
  }
  if (params?.target_type) {
    conditions.push('a.target_type = ?')
    values.push(params.target_type)
  }
  if (params?.target_id !== undefined) {
    conditions.push('a.target_id = ?')
    values.push(params.target_id)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_records a ${where}`)
  const { total } = countStmt.get(...values) as { total: number }

  const stmt = db.prepare(`
    SELECT a.id, a.operator_id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
      u.id as 'operator.id', u.username as 'operator.username', u.role as 'operator.role', u.created_at as 'operator.created_at'
    FROM audit_records a
    LEFT JOIN users u ON a.operator_id = u.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(...values, pageSize, offset) as Record<string, unknown>[]

  const items = rows.map((row) => {
    const record: AuditRecord = {
      id: row.id as number,
      operator_id: row.operator_id as number | null,
      action: row.action as AuditAction,
      target_type: row.target_type as AuditRecord['target_type'],
      target_id: row.target_id as number,
      detail: row.detail as string | null,
      created_at: row.created_at as string,
    }
    if (row['operator.id']) {
      record.operator = {
        id: row['operator.id'] as number,
        username: row['operator.username'] as string,
        role: row['operator.role'] as UserRole,
        created_at: row['operator.created_at'] as string,
      }
    }
    return record
  })

  return { items, total, page, pageSize }
}

export default {
  create,
  findAll,
}
