import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import * as PublishService from '../services/PublishService.js'
import type {
  PublishRecord,
  PublishStatus,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/records',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, status, start_date, end_date, channel_id } = req.query as {
      page?: string
      pageSize?: string
      status?: string
      start_date?: string
      end_date?: string
      channel_id?: string
    }

    const params: PaginationParams & {
      status?: PublishStatus
      start_date?: string
      end_date?: string
      channel_id?: number
    } = {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 10,
    }

    if (status) params.status = status as PublishStatus
    if (start_date) params.start_date = start_date
    if (end_date) params.end_date = end_date
    if (channel_id) params.channel_id = parseInt(channel_id)

    const result = await PublishService.getPublishRecords(params)

    const response: ApiResponse<PaginationResult<PublishRecord>> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/records/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id)
    const record = await PublishService.getPublishRecordDetail(id)

    if (!record) {
      const response: ApiResponse = {
        success: false,
        error: '发布记录不存在',
      }
      res.status(404).json(response)
      return
    }

    const response: ApiResponse<PublishRecord> = {
      success: true,
      data: record,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/records/:id/retry',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id)
    const result = await PublishService.retryPublish(id)

    const response: ApiResponse<PublishRecord> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

export default router
