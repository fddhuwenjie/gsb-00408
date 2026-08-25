import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import PublishService from '../services/PublishService.js'
import type {
  FailureReview,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, status } = req.query as PaginationParams & { status?: string }
    let result: PaginationResult<FailureReview>
    if (status) {
      result = await PublishService.getFailureReviewsByStatus(status as FailureReview['status'], { page, pageSize })
    } else {
      result = await PublishService.getFailureReviews({ page, pageSize })
    }
    const response: ApiResponse<PaginationResult<FailureReview>> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

router.post(
  '/:id/resolve',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw createError('用户未登录', 401)
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的复盘ID', 400)
    const { conclusion, action_type } = req.body as { conclusion: string; action_type: 'republish' | 'manual_publish' }
    if (!conclusion || conclusion.trim().length === 0) throw createError('处理结论不能为空', 400)
    if (!action_type || !['republish', 'manual_publish'].includes(action_type)) throw createError('处理方式无效', 400)
    const result = await PublishService.resolveFailureReview(id, req.user.id, conclusion, action_type)
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
