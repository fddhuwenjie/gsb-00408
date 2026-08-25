import type { Request, Response, NextFunction } from 'express'
import db from '../db/index.js'
import '../types/index.js'
import type { User, UserRole } from '../../../shared/types.js'

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: '未提供认证令牌',
    })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = parseToken(token)
    const user = db
      .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(decoded.userId) as User | undefined

    if (!user) {
      res.status(401).json({
        success: false,
        error: '用户不存在',
      })
      return
    }

    req.user = user
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: '认证令牌无效',
    })
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: '未登录',
      })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: '权限不足',
      })
      return
    }

    next()
  }
}

function parseToken(token: string): { userId: number } {
  const buffer = Buffer.from(token, 'base64')
  const decoded = buffer.toString('utf-8')
  const parts = decoded.split(':')

  if (parts.length !== 2) {
    throw new Error('Invalid token format')
  }

  return {
    userId: parseInt(parts[0], 10),
  }
}
