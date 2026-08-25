import db, { transaction } from '../db/index.js'
import type { Content, ContentStatus, ContentType, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateContentParams {
  creator_id: number
  type: ContentType
  title: string
  content: string
  thumbnail_url?: string
  status?: ContentStatus
  scan_version?: number
}

export interface UpdateContentParams {
  type?: ContentType
  title?: string
  content?: string
  thumbnail_url?: string
  status?: ContentStatus
  scan_version?: number
}

export async function create(params: CreateContentParams): Promise<Content> {
  return transaction((tx) => {
    const now = new Date().toISOString()
    const stmt = tx.prepare(`
      INSERT INTO contents (creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      params.creator_id,
      params.type,
      params.title,
      params.content,
      params.thumbnail_url || null,
      params.status || 'draft',
      params.scan_version || 0,
      now,
      now,
    )
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
      FROM contents
      WHERE id = ?
    `)
    return selectStmt.get(id) as Content
  })
}

export async function findById(id: number): Promise<Content | null> {
  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE id = ?
  `)
  return stmt.get(id) as Content | null
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM contents')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function findByStatus(status: ContentStatus, params?: PaginationParams): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM contents WHERE status = ?')
  const { total } = countStmt.get(status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE status = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(status, pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function findByCreatorId(creatorId: number, params?: PaginationParams): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM contents WHERE creator_id = ?')
  const { total } = countStmt.get(creatorId) as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE creator_id = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(creatorId, pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function findByCreatorIdAndStatus(
  creatorId: number,
  status: ContentStatus,
  params?: PaginationParams,
): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM contents WHERE creator_id = ? AND status = ?')
  const { total } = countStmt.get(creatorId, status) as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE creator_id = ? AND status = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(creatorId, status, pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function findByTimeRange(
  startTime: string,
  endTime: string,
  params?: PaginationParams,
): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM contents WHERE created_at >= ? AND created_at <= ?',
  )
  const { total } = countStmt.get(startTime, endTime) as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(startTime, endTime, pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function findByType(type: ContentType, params?: PaginationParams): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM contents WHERE type = ?')
  const { total } = countStmt.get(type) as { total: number }

  const stmt = db.prepare(`
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE type = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(type, pageSize, offset) as Content[]

  return { items, total, page, pageSize }
}

export async function update(id: number, params: UpdateContentParams): Promise<Content | null> {
  return transaction((tx) => {
    const fields: string[] = ['updated_at = ?']
    const values: (string | number | boolean | null | undefined)[] = [new Date().toISOString()]

    if (params.title !== undefined) {
      fields.push('title = ?')
      values.push(params.title)
    }
    if (params.content !== undefined) {
      fields.push('content = ?')
      values.push(params.content)
    }
    if (params.thumbnail_url !== undefined) {
      fields.push('thumbnail_url = ?')
      values.push(params.thumbnail_url)
    }
    if (params.status !== undefined) {
      fields.push('status = ?')
      values.push(params.status)
    }
    if (params.scan_version !== undefined) {
      fields.push('scan_version = ?')
      values.push(params.scan_version)
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE contents
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    
    const selectStmt = tx.prepare(`
      SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
      FROM contents
      WHERE id = ?
    `)
    return selectStmt.get(id) as Content | null
  })
}

export async function updateStatus(id: number, status: ContentStatus): Promise<Content | null> {
  return update(id, { status })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM contents WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export default {
  create,
  findById,
  findAll,
  findByStatus,
  findByCreatorId,
  findByCreatorIdAndStatus,
  findByTimeRange,
  findByType,
  update,
  updateStatus,
  remove,
}
