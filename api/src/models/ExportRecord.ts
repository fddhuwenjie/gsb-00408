import db, { transaction } from '../db/index.js'
import type { ExportRecord, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateExportRecordParams {
  operator_id: number
  file_path: string
}

export interface UpdateExportRecordParams {
  file_path?: string
}

export async function create(params: CreateExportRecordParams): Promise<ExportRecord> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO export_records (operator_id, file_path, created_at)
      VALUES (?, ?, ?)
    `)
    const result = stmt.run(params.operator_id, params.file_path, now)
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, operator_id, file_path, created_at
      FROM export_records
      WHERE id = ?
    `)
    return selectStmt.get(id) as ExportRecord
  })
}

export async function findById(id: number, includeRelations = false): Promise<ExportRecord | null> {
  let sql = `
    SELECT er.id, er.operator_id, er.file_path, er.created_at
  `
  if (includeRelations) {
    sql += `,
      u.id as 'operator.id', u.username as 'operator.username', u.role as 'operator.role', u.created_at as 'operator.created_at'
    FROM export_records er
    LEFT JOIN users u ON er.operator_id = u.id
    WHERE er.id = ?
  `
  } else {
    sql += ' FROM export_records er WHERE er.id = ?'
  }

  const stmt = db.prepare(sql)
  const result = stmt.get(id) as Record<string, unknown> | null

  if (!result) return null

  if (includeRelations) {
    const record: ExportRecord = {
      id: result.id as number,
      operator_id: result.operator_id as number,
      file_path: result.file_path as string,
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

  return result as unknown as ExportRecord
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<ExportRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM export_records')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, operator_id, file_path, created_at
    FROM export_records
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as ExportRecord[]

  return { items, total, page, pageSize }
}

export async function findByOperatorId(
  operatorId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ExportRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM export_records WHERE operator_id = ?')
  const { total } = countStmt.get(operatorId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, operator_id, file_path, created_at
    FROM export_records
    WHERE operator_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(operatorId, pageSize, offset) as ExportRecord[]

  return { items, total, page, pageSize }
}

export async function findByTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<ExportRecord>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM export_records WHERE created_at >= ? AND created_at <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, operator_id, file_path, created_at
    FROM export_records
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as ExportRecord[]

  return { items, total, page, pageSize }
}

export async function countByOperatorId(operatorId: number): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM export_records WHERE operator_id = ?')
  const result = stmt.get(operatorId) as { count: number }
  return result.count
}

export async function update(id: number, params: UpdateExportRecordParams): Promise<ExportRecord | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.file_path !== undefined) {
      fields.push('file_path = ?')
      values.push(params.file_path)
    }

    const selectStmt = tx.prepare(`
      SELECT id, operator_id, file_path, created_at
      FROM export_records
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as ExportRecord | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE export_records
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as ExportRecord | null
  })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM export_records WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  findByOperatorId,
  findByTimeRange,
  countByOperatorId,
  update,
  remove,
}
