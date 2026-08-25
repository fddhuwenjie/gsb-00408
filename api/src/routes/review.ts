import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import ContentModel from '../models/Content.js'
import ReviewRecordModel from '../models/ReviewRecord.js'
import ScheduleModel from '../models/Schedule.js'
import { validateReviewOpinion } from '../utils/validator.js'
import { schedulePublishTask } from '../scheduler/publishTask.js'
import type {
  Content,
  ReviewRecord,
  ReviewRequest,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/queue',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = req.query as PaginationParams

    const result = await ContentModel.findByStatus('pending_review', { page, pageSize })

    const response: ApiResponse<PaginationResult<Content>> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/:id/approve',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的内容ID', 400)
    }

    const content = await ContentModel.findById(id)

    if (!content) {
      throw createError('内容不存在', 404)
    }

    if (content.status !== 'pending_review') {
      throw createError('只有待复核的内容才能通过', 400)
    }

    const { opinion } = req.body as ReviewRequest

    const opinionCheck = await validateReviewOpinion('approve', opinion || '')
    if (!opinionCheck.valid) {
      throw createError(opinionCheck.error!, 400)
    }

    const reviewRecord = await ReviewRecordModel.create({
      content_id: id,
      reviewer_id: req.user.id,
      decision: 'approve',
      opinion: opinion || '',
    })

    await ContentModel.updateStatus(id, 'review_approved')

    const schedules = await ScheduleModel.findByContentId(id)

    for (const schedule of schedules.items) {
      if (schedule.status === 'pending') {
        await ScheduleModel.updateStatus(schedule.id, 'scheduled')
        await schedulePublishTask(schedule.id, schedule.schedule_time)
      }
    }

    const response: ApiResponse<ReviewRecord> = {
      success: true,
      data: reviewRecord,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/:id/reject',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的内容ID', 400)
    }

    const content = await ContentModel.findById(id)

    if (!content) {
      throw createError('内容不存在', 404)
    }

    if (content.status !== 'pending_review') {
      throw createError('只有待复核的内容才能驳回', 400)
    }

    const { opinion } = req.body as ReviewRequest

    const opinionCheck = await validateReviewOpinion('reject', opinion || '')
    if (!opinionCheck.valid) {
      throw createError(opinionCheck.error!, 400)
    }

    const reviewRecord = await ReviewRecordModel.create({
      content_id: id,
      reviewer_id: req.user.id,
      decision: 'reject',
      opinion,
    })

    await ContentModel.updateStatus(id, 'review_rejected')

    const schedules = await ScheduleModel.findByContentId(id)

    for (const schedule of schedules.items) {
      if (['pending', 'scheduled'].includes(schedule.status)) {
        await ScheduleModel.updateStatus(schedule.id, 'rejected')
      }
    }

    const response: ApiResponse<ReviewRecord> = {
      success: true,
      data: reviewRecord,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/:id/override',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw createError('用户未登录', 401)
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的内容ID', 400)
    const { decision, opinion } = req.body as { decision: 'approve' | 'reject'; opinion: string }
    if (!decision || !['approve', 'reject'].includes(decision)) throw createError('决策无效', 400)
    if (!opinion || opinion.trim().length === 0) throw createError('改判意见不能为空', 400)
    const ReviewService = (await import('../services/ReviewService.js')).default
    const result = await ReviewService.overrideReview(id, req.user.id, decision, opinion)
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

router.get(
  '/:id/audit-trail',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的内容ID', 400)
    const { page, pageSize } = req.query as PaginationParams
    const ReviewService = (await import('../services/ReviewService.js')).default
    const result = await ReviewService.getReviewAuditTrail(id, { page, pageSize })
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
