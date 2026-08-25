import db, { transaction } from '../db/index.js'
import type { User, UserRole, PaginationParams, PaginationResult } from '../../../shared/types.js'

export interface CreateUserParams {
  username: string
  password_hash: string
  role: UserRole
}

export interface UpdateUserParams {
  username?: string
  password_hash?: string
  role?: UserRole
}

export async function create(params: CreateUserParams): Promise<User> {
  return transaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `)
    const result = stmt.run(params.username, params.password_hash, params.role)
    const id = result.lastInsertRowid as number
    const selectStmt = tx.prepare(`
      SELECT id, username, role, created_at
      FROM users
      WHERE id = ?
    `)
    return selectStmt.get(id) as User
  })
}

export async function findById(id: number): Promise<User | null> {
  const stmt = db.prepare(`
    SELECT id, username, role, created_at
    FROM users
    WHERE id = ?
  `)
  return stmt.get(id) as User | null
}

export async function findByUsername(username: string): Promise<User | null> {
  const stmt = db.prepare(`
    SELECT id, username, role, created_at
    FROM users
    WHERE username = ?
  `)
  return stmt.get(username) as User | null
}

export async function findByUsernameWithPassword(username: string): Promise<(User & { password_hash: string }) | null> {
  const stmt = db.prepare(`
    SELECT id, username, password_hash, role, created_at
    FROM users
    WHERE username = ?
  `)
  return stmt.get(username) as (User & { password_hash: string }) | null
}

export async function findAll(params?: PaginationParams): Promise<PaginationResult<User>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM users')
  const { total } = countStmt.get() as { total: number }

  const stmt = db.prepare(`
    SELECT id, username, role, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(pageSize, offset) as User[]

  return { items, total, page, pageSize }
}

export async function findByRole(role: UserRole, params?: PaginationParams): Promise<PaginationResult<User>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM users WHERE role = ?')
  const { total } = countStmt.get(role) as { total: number }

  const stmt = db.prepare(`
    SELECT id, username, role, created_at
    FROM users
    WHERE role = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
  const items = stmt.all(role, pageSize, offset) as User[]

  return { items, total, page, pageSize }
}

export async function update(id: number, params: UpdateUserParams): Promise<User | null> {
  return transaction((tx) => {
    const fields: string[] = []
    const values: (string | number | boolean | null | undefined)[] = []

    if (params.username !== undefined) {
      fields.push('username = ?')
      values.push(params.username)
    }
    if (params.password_hash !== undefined) {
      fields.push('password_hash = ?')
      values.push(params.password_hash)
    }
    if (params.role !== undefined) {
      fields.push('role = ?')
      values.push(params.role)
    }

    const selectStmt = tx.prepare(`
      SELECT id, username, role, created_at
      FROM users
      WHERE id = ?
    `)

    if (fields.length === 0) {
      return selectStmt.get(id) as User | null
    }

    values.push(id)
    const stmt = tx.prepare(`
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...values)
    return selectStmt.get(id) as User | null
  })
}

export async function remove(id: number): Promise<boolean> {
  return transaction((tx) => {
    const stmt = tx.prepare('DELETE FROM users WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  })
}

export async function existsByUsername(username: string): Promise<boolean> {
  const stmt = db.prepare('SELECT 1 FROM users WHERE username = ?')
  return stmt.get(username) !== undefined
}

export default {
  create,
  findById,
  findByUsername,
  findByUsernameWithPassword,
  findAll,
  findByRole,
  update,
  remove,
  existsByUsername,
}
