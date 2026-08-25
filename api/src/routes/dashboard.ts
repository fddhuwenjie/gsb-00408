import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware } from '../middleware/auth.js'
import * as DashboardService from '../services/DashboardService.js'
import ContentModel from '../models/Content.js'
import ScheduleModel from '../models/Schedule.js'
import type {
  DashboardStats,
  Content,
  Schedule,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const stats = await DashboardService.getDashboardStats()

    const response: ApiResponse<DashboardStats> = {
      success: true,
      data: stats,
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/pending',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await ContentModel.findByStatus('pending_review', { page: 1, pageSize: 5 })

    const response: ApiResponse<Content[]> = {
      success: true,
      data: result.items,
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/recent-schedules',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await ScheduleModel.findAll({ page: 1, pageSize: 5 })

    const response: ApiResponse<Schedule[]> = {
      success: true,
      data: result.items,
    }

    res.status(200).json(response)
  }),
)

export default router
