import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import UserModel from '../models/User.js'
import type { LoginRequest, LoginResponse, ApiResponse } from '../../../shared/types.js'

const router = Router()

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as LoginRequest

    if (!username || !password) {
      throw createError('用户名和密码不能为空', 400)
    }

    const userWithPassword = await UserModel.findByUsernameWithPassword(username)

    if (!userWithPassword) {
      throw createError('用户名或密码错误', 401)
    }

    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password_hash)

    if (!isPasswordValid) {
      throw createError('用户名或密码错误', 401)
    }

    const token = Buffer.from(`${userWithPassword.id}:${Date.now()}`).toString('base64')

    const { password_hash, ...user } = userWithPassword
    void password_hash

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user,
        token,
      },
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/profile',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const user = await UserModel.findById(req.user.id)

    if (!user) {
      throw createError('用户不存在', 404)
    }

    const response: ApiResponse<typeof user> = {
      success: true,
      data: user,
    }

    res.status(200).json(response)
  }),
)

export default router
