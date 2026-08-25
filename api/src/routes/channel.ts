import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import ChannelModel from '../models/Channel.js'
import ScheduleModel from '../models/Schedule.js'
import ChannelService from '../services/ChannelService.js'
import type {
  Channel,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, status, type } = req.query as PaginationParams & {
      status?: string
      type?: string
    }

    let result: PaginationResult<Channel>

    if (status) {
      result = await ChannelModel.findByStatus(status as 'active' | 'inactive', { page, pageSize })
    } else if (type) {
      result = await ChannelModel.findByType(type, { page, pageSize })
    } else {
      result = await ChannelModel.findAll({ page, pageSize })
    }

    const response: ApiResponse<PaginationResult<Channel>> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/status',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const [activeCount, inactiveCount] = await Promise.all([
      ChannelModel.countByStatus('active'),
      ChannelModel.countByStatus('inactive'),
    ])

    const channels = await ChannelModel.findAll({ page: 1, pageSize: 100 })

    const statusData = await Promise.all(
      channels.items.map(async (channel) => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const scheduleCount = await ScheduleModel.findByChannelIdAndTimeRange(
          channel.id,
          today.toISOString(),
          tomorrow.toISOString(),
          { page: 1, pageSize: 1 }
        )

        return {
          ...channel,
          today_schedule_count: scheduleCount.total,
        }
      }),
    )

    const response: ApiResponse<{
      active_count: number
      inactive_count: number
      channels: typeof statusData
    }> = {
      success: true,
      data: {
        active_count: activeCount,
        inactive_count: inactiveCount,
        channels: statusData,
      },
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, type, status, config } = req.body as {
      name: string
      type: string
      status?: 'active' | 'inactive'
      config?: string
    }

    if (!name || !type) {
      throw createError('渠道名称和类型不能为空', 400)
    }

    const existingChannel = await ChannelModel.findByName(name)
    if (existingChannel) {
      throw createError('该渠道名称已存在', 400)
    }

    const channel = await ChannelModel.create({
      name,
      type,
      status,
      config,
    })

    const response: ApiResponse<Channel> = {
      success: true,
      data: channel,
    }

    res.status(201).json(response)
  }),
)

router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的渠道ID', 400)
    }

    const channel = await ChannelModel.findById(id)
    if (!channel) {
      throw createError('渠道不存在', 404)
    }

    const { name, type, status, config } = req.body as {
      name?: string
      type?: string
      status?: 'active' | 'inactive'
      config?: string
    }

    const updateParams: Parameters<typeof ChannelModel.update>[1] = {}

    if (name !== undefined) {
      updateParams.name = name
    }
    if (type !== undefined) {
      updateParams.type = type
    }
    if (status !== undefined) {
      updateParams.status = status
    }
    if (config !== undefined) {
      updateParams.config = config
    }

    const updatedChannel = await ChannelModel.update(id, updateParams)

    const response: ApiResponse<Channel> = {
      success: true,
      data: updatedChannel!,
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/health',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const healthList = await ChannelService.getChannelHealthList()
    const response: ApiResponse<typeof healthList> = {
      success: true,
      data: healthList,
    }
    res.status(200).json(response)
  }),
)

router.get(
  '/:id/health',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的渠道ID', 400)
    const health = await ChannelService.getChannelHealth(id)
    const response: ApiResponse<typeof health> = {
      success: true,
      data: health,
    }
    res.status(200).json(response)
  }),
)

router.put(
  '/:id/health',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的渠道ID', 400)
    const { success_rate, last_failure_reason, rate_limit_status, responsible_person } = req.body as {
      success_rate?: number
      last_failure_reason?: string
      rate_limit_status?: string
      responsible_person?: string
    }
    const updated = await ChannelService.updateChannelHealth(id, {
      success_rate,
      last_failure_reason,
      rate_limit_status: rate_limit_status as 'normal' | 'limited' | 'blocked' | undefined,
      responsible_person,
    })
    const response: ApiResponse<typeof updated> = {
      success: true,
      data: updated,
    }
    res.status(200).json(response)
  }),
)

router.post(
  '/:id/health/refresh',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) throw createError('无效的渠道ID', 400)
    const health = await ChannelService.refreshChannelHealth(id)
    const response: ApiResponse<typeof health> = {
      success: true,
      data: health,
    }
    res.status(200).json(response)
  }),
)

router.get(
  '/risk/high',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const highRisk = await ChannelService.getHighRiskChannels()
    const response: ApiResponse<typeof highRisk> = {
      success: true,
      data: highRisk,
    }
    res.status(200).json(response)
  }),
)

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的渠道ID', 400)
    }

    const channel = await ChannelModel.findById(id)
    if (!channel) {
      throw createError('渠道不存在', 404)
    }

    const activeSchedules = await ScheduleModel.findByChannelIdAndTimeRange(
      id,
      new Date().toISOString(),
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      { page: 1, pageSize: 1 }
    )

    if (activeSchedules.total > 0) {
      throw createError('该渠道存在未完成的排期，无法删除', 400)
    }

    const deleted = await ChannelModel.remove(id)

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted },
    }

    res.status(200).json(response)
  }),
)

export default router
