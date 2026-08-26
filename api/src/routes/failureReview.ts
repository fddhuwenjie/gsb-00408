import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import PublishService from '../services/PublishService.js'
import { schedulePublishTask } from '../scheduler/publishTask.js'
import type {
  FailureReview,
  FailureReviewAction,
  PaginationParams,
  PaginationResult,
  ApiResponse,
  ResolveFailureReviewRequest,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, status } = req.query as PaginationParams & { status?: string }
    const result = await PublishService.getFailureReviews({
      page,
      pageSize,
      status,
    })
    const response: ApiResponse<PaginationResult<FailureReview>> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

router.get(
  '/:id',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的复核ID', 400)
    const review = await PublishService.getFailureReviewDetail(id)
    const response: ApiResponse<FailureReview> = {
      success: true,
      data: review,
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
    if (isNaN(id)) throw createError('无效的复核ID', 400)

    const { conclusion, action_type, schedule_time } = req.body as ResolveFailureReviewRequest
    if (!conclusion || conclusion.trim().length === 0) {
      throw createError('处理结论不能为空', 400)
    }
    const validActions: FailureReviewAction[] = ['republish', 'manual_publish', 'reschedule']
    if (!action_type || !validActions.includes(action_type)) {
      throw createError('处理方式无效', 400)
    }
    if (action_type === 'reschedule' && !schedule_time) {
      throw createError('重新排期必须选择新的排期时间', 400)
    }

    const result = await PublishService.resolveFailureReview(
      id,
      req.user.id,
      conclusion,
      action_type,
      schedule_time,
    )

    if (action_type === 'reschedule' && result.schedule) {
      schedulePublishTask(result.schedule.id, result.schedule.schedule_time)
    }

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
