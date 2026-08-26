import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import AuditLogModel from '../models/AuditLog.js'
import type { ApiResponse, AuditLog, PaginationResult } from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, action, target_type, target_id, operator_id } = req.query as {
      page?: string
      pageSize?: string
      action?: string
      target_type?: string
      target_id?: string
      operator_id?: string
    }

    const result = await AuditLogModel.findAll({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      action,
      target_type,
      target_id: target_id ? parseInt(target_id, 10) : undefined,
      operator_id: operator_id ? parseInt(operator_id, 10) : undefined,
    })

    const response: ApiResponse<PaginationResult<AuditLog>> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
