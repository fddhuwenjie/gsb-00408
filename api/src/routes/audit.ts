import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import AuditRecordModel from '../models/AuditRecord.js'
import type {
  AuditRecord,
  AuditAction,
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
    const { page, pageSize, action, target_type, target_id } = req.query as PaginationParams & {
      action?: AuditAction
      target_type?: 'channel' | 'schedule' | 'failure_review'
      target_id?: string
    }

    const result: PaginationResult<AuditRecord> = await AuditRecordModel.findAll({
      page,
      pageSize,
      action,
      target_type,
      target_id: target_id !== undefined ? parseInt(target_id, 10) : undefined,
    })

    const response: ApiResponse<PaginationResult<AuditRecord>> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

export default router
