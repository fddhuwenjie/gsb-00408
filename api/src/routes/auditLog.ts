import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import AuditService from '../services/AuditService.js'
import type { AuditLog, PaginationParams, PaginationResult, ApiResponse } from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

// 全局审计日志查询，仅 reviewer/admin 可见
router.get(
  '/',
  requireRole('reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, target_type, target_id, operator_id, action } = req.query as PaginationParams & {
      target_type?: string
      target_id?: string
      operator_id?: string
      action?: string
    }

    const result = await AuditService.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      target_type,
      target_id: target_id ? Number(target_id) : undefined,
      operator_id: operator_id ? Number(operator_id) : undefined,
      action,
    })

    const response: ApiResponse<PaginationResult<AuditLog>> = {
      success: true,
      data: result,
    }
    res.status(200).json(response)
  }),
)

export default router
