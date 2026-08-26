import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import AuditLogModel from '../models/AuditLog.js'
import type { ApiResponse, PaginationResult, AuditLog, AuditAction } from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = req.query.page ? parseInt(req.query.page as string) : 1
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20
    const action = req.query.action as AuditAction | undefined
    const resource_type = req.query.resource_type as string | undefined
    const result = await AuditLogModel.findAll({ page, pageSize, action, resource_type })
    const response: ApiResponse<PaginationResult<AuditLog>> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
