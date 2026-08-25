import db, { transaction } from '../db/index.js'
import type { Channel, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateChannelParams {
  name: string
  type: string
  status?: 'active' | 'inactive'
  config?: string
}

export interface UpdateChannelParams {
  name?: string
  type?: string
  status?: 'active' | 'inactive'
  config?: string
}

export async function create(params: CreateChannelParams): Promise<Channel> {
  return transaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO channels (name, type, status, config)
      VALUES (?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.name,
      params.type,
      params.status || 'active',
      params.config || null,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, name, type, status, config
      FROM channels
      WHERE id = ?
    `)
    return selectStmt.get(id) as Channel
  })
}

export async function findById(id: number): Promise<Channel | null> {
  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    WHERE id = ?
  `)
  return stmt.get(id) as Channel | null
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<Channel>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM channels')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    ORDER BY name ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as Channel[]

  return { items, total, page, pageSize }
}

export async function findActiveChannels(): Promise<Channel[]> {
  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    WHERE status = 'active'
    ORDER BY name ASC
  `)
  return stmt.all() as Channel[]
}

export async function findByStatus(
  status: 'active' | 'inactive',
  params?: PaginationParams,
): Promise<PaginationResult<Channel>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM channels WHERE status = ?')
  const { total } = countStmt.get(status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    WHERE status = ?
    ORDER BY name ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(status, pageSize, offset) as Channel[]

  return { items, total, page, pageSize }
}

export async function findByType(type: string, params?: PaginationParams): Promise<PaginationResult<Channel>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM channels WHERE type = ?')
  const { total } = countStmt.get(type) as { total: number }

  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    WHERE type = ?
    ORDER BY name ASC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(type, pageSize, offset) as Channel[]

  return { items, total, page, pageSize }
}

export async function findByName(name: string): Promise<Channel | null> {
  const stmt = db.prepare(`
    SELECT id, name, type, status, config
    FROM channels
    WHERE name = ?
    LIMIT 1
  `)
  return stmt.get(name) as Channel | null
}

export async function countByStatus(status: 'active' | 'inactive'): Promise<number> {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM channels WHERE status = ?')
  const result = stmt.get(status) as { count: number }
  return result.count
}

export async function update(id: number, params: UpdateChannelParams): Promise<Channel | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.name !== undefined) {
      fields.push('name = ?')
      values.push(params.name)
    }
    if (params.type !== undefined) {
      fields.push('type = ?')
      values.push(params.type)
    }
    if (params.status !== undefined) {
      fields.push('status = ?')
      values.push(params.status)
    }
    if (params.config !== undefined) {
      fields.push('config = ?')
      values.push(params.config)
    }

    const selectStmt = tx.prepare(`
      SELECT id, name, type, status, config
      FROM channels
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as Channel | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE channels
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as Channel | null
  })
}

export async function updateStatus(id: number, status: 'active' | 'inactive'): Promise<Channel | null> {
  return update(id, { status })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM channels WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export async function existsByName(name: string): Promise<boolean> {
  const stmt = db.prepare('SELECT 1 FROM channels WHERE name = ?')
  return stmt.get(name) !== undefined
}

export default {
  create,
  findById,
  findAll,
  findActiveChannels,
  findByStatus,
  findByType,
  findByName,
  countByStatus,
  update,
  updateStatus,
  remove,
  existsByName,
}
