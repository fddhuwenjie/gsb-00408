import crypto from 'crypto'
import { createError } from '../types/index.js'
import UserModel from '../models/User.js'
import type { User, LoginResponse, PaginationParams, PaginationResult } from '../../../shared/types.js'

export async function login(username: string, password: string): Promise<LoginResponse> {
  const userWithPassword = await UserModel.findByUsernameWithPassword(username)
  
  if (!userWithPassword) {
    throw createError('用户名或密码错误', 401, 'INVALID_CREDENTIALS')
  }

  const passwordHash = crypto
    .pbkdf2Sync(password, 'salt', 100000, 64, 'sha512')
    .toString('hex')

  if (passwordHash !== userWithPassword.password_hash) {
    throw createError('用户名或密码错误', 401, 'INVALID_CREDENTIALS')
  }

  const timestamp = Date.now()
  const token = `${userWithPassword.id}.${timestamp}`

  const user: User = {
    id: userWithPassword.id,
    username: userWithPassword.username,
    role: userWithPassword.role,
    created_at: userWithPassword.created_at,
  }

  return { user, token }
}

export async function getProfile(userId: number): Promise<User> {
  const user = await UserModel.findById(userId)
  
  if (!user) {
    throw createError('用户不存在', 404, 'USER_NOT_FOUND')
  }

  return user
}

export async function getUserList(params?: PaginationParams): Promise<PaginationResult<User>> {
  return UserModel.findAll(params)
}

export default {
  login,
  getProfile,
  getUserList,
}
