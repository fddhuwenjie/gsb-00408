import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import ScheduleModel from '../models/Schedule.js'
import ContentModel from '../models/Content.js'
import ChannelModel from '../models/Channel.js'
import ScheduleService from '../services/ScheduleService.js'
import { validateScheduleTime, validateDuplicateSchedule, validateSensitiveWordsHandled } from '../utils/validator.js'
import { schedulePublishTask, cancelPublishTask } from '../scheduler/publishTask.js'
import type {
  Schedule,
  UpdateScheduleRequest,
  PaginationParams,
  PaginationResult,
  ApiResponse,
  ScheduleStatus,
  ScheduleRiskWarning,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, status, startDate, endDate } = req.query as PaginationParams & {
      status?: string
      startDate?: string
      endDate?: string
    }

    let result: PaginationResult<Schedule>

    if (status) {
      result = await ScheduleModel.findByStatus(status as ScheduleStatus, { page, pageSize })
    } else if (startDate && endDate) {
      result = await ScheduleModel.findByTimeRange(startDate, endDate, { page, pageSize })
    } else {
      result = await ScheduleModel.findAll({ page, pageSize })
    }

    const itemsWithRelations = await Promise.all(
      result.items.map(async (schedule) => {
        const scheduleWithRelations = await ScheduleModel.findById(schedule.id, true)
        return scheduleWithRelations || schedule
      }),
    )

    const response: ApiResponse<PaginationResult<Schedule>> = {
      success: true,
      data: {
        ...result,
        items: itemsWithRelations,
      },
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/calendar',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query as {
      startDate?: string
      endDate?: string
    }

    if (!startDate || !endDate) {
      throw createError('开始日期和结束日期不能为空', 400)
    }

    const result = await ScheduleModel.findByTimeRange(startDate, endDate, {
      page: 1,
      pageSize: 1000,
    })

    const calendarData: Record<string, Schedule[]> = {}

    for (const schedule of result.items) {
      const date = schedule.schedule_time.split('T')[0]
      if (!calendarData[date]) {
        calendarData[date] = []
      }
      const scheduleWithRelations = await ScheduleModel.findById(schedule.id, true)
      if (scheduleWithRelations) {
        calendarData[date].push(scheduleWithRelations)
      }
    }

    const response: ApiResponse<typeof calendarData> = {
      success: true,
      data: calendarData,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/',
  requireRole('editor', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const { content_id, channel_id, schedule_time } = req.body as {
      content_id: number
      channel_id: number
      schedule_time: string
    }

    if (!content_id || !channel_id || !schedule_time) {
      throw createError('内容ID、渠道ID和排期时间不能为空', 400)
    }

    const content = await ContentModel.findById(content_id)
    if (!content) {
      throw createError('内容不存在', 404)
    }

    if (req.user.role === 'editor' && content.creator_id !== req.user.id) {
      throw createError('无权为他人内容创建排期', 403)
    }

    if (content.status !== 'review_approved') {
      throw createError('只有复核通过的内容才能创建排期', 400)
    }

    const sensitiveCheck = await validateSensitiveWordsHandled(content_id)
    if (!sensitiveCheck.valid) {
      throw createError(sensitiveCheck.error!, 400)
    }

    const channel = await ChannelModel.findById(channel_id)
    if (!channel) {
      throw createError('渠道不存在', 404)
    }

    if (channel.status !== 'active') {
      throw createError('渠道未启用', 400)
    }

    const timeCheck = await validateScheduleTime(schedule_time)
    if (!timeCheck.valid) {
      throw createError(timeCheck.error!, 400)
    }

    const duplicateCheck = await validateDuplicateSchedule(channel_id, schedule_time)
    if (!duplicateCheck.valid) {
      throw createError(duplicateCheck.error!, 400)
    }

    const { schedule, risk_warning } = await ScheduleService.createScheduleWithRisk(
      content_id,
      {
        channel_id,
        schedule_time,
        status: 'scheduled',
      },
    )

    await ContentModel.updateStatus(content_id, 'scheduled')

    await schedulePublishTask(schedule.id, schedule.schedule_time)

    const response: ApiResponse<{ schedule: Schedule; risk_warning?: ScheduleRiskWarning }> = {
      success: true,
      data: { schedule, risk_warning },
    }

    res.status(201).json(response)
  }),
)

router.get(
  '/risk/:channelId',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const channelId = parseInt(req.params.channelId, 10)
    if (isNaN(channelId)) {
      throw createError('无效的渠道ID', 400)
    }
    const riskWarning = await ScheduleService.assessScheduleRisk(channelId)
    const response: ApiResponse<typeof riskWarning> = {
      success: true,
      data: riskWarning,
    }
    res.status(200).json(response)
  }),
)

router.put(
  '/:id',
  requireRole('editor', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的排期ID', 400)
    }

    const schedule = await ScheduleModel.findById(id, true)

    if (!schedule) {
      throw createError('排期不存在', 404)
    }

    if (req.user.role === 'editor' && schedule.content?.creator_id !== req.user.id) {
      throw createError('无权修改此排期', 403)
    }

    if (schedule.status === 'published') {
      throw createError('已发布的排期不能修改', 400)
    }

    const { channel_id, schedule_time } = req.body as UpdateScheduleRequest

    const updateParams: Parameters<typeof ScheduleModel.update>[1] = {}

    if (channel_id !== undefined) {
      const channel = await ChannelModel.findById(channel_id)
      if (!channel) {
        throw createError('渠道不存在', 404)
      }
      if (channel.status !== 'active') {
        throw createError('渠道未启用', 400)
      }
      updateParams.channel_id = channel_id
    }

    if (schedule_time !== undefined) {
      const timeCheck = await validateScheduleTime(schedule_time)
      if (!timeCheck.valid) {
        throw createError(timeCheck.error!, 400)
      }

      const checkChannelId = channel_id || schedule.channel_id
      const duplicateCheck = await validateDuplicateSchedule(checkChannelId, schedule_time, id)
      if (!duplicateCheck.valid) {
        throw createError(duplicateCheck.error!, 400)
      }

      updateParams.schedule_time = schedule_time
    }

    await cancelPublishTask(id)

    const updatedSchedule = await ScheduleModel.update(id, updateParams)

    if (updatedSchedule && updatedSchedule.status === 'scheduled') {
      const newScheduleTime = schedule_time || updatedSchedule.schedule_time
      await schedulePublishTask(updatedSchedule.id, newScheduleTime)
    }

    const response: ApiResponse<Schedule> = {
      success: true,
      data: updatedSchedule!,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/:id/withdraw',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的排期ID', 400)
    }

    const { reason } = req.body as { reason?: string }

    if (!reason || reason.trim().length === 0) {
      throw createError('撤回原因不能为空', 400)
    }

    const schedule = await ScheduleModel.findById(id, true)

    if (!schedule) {
      throw createError('排期不存在', 404)
    }

    if (req.user.role === 'editor' && schedule.content?.creator_id !== req.user.id) {
      throw createError('无权撤回此排期', 403)
    }

    if (!['pending', 'approved', 'scheduled'].includes(schedule.status)) {
      throw createError('只有待审核、已通过或已排期的排期才能撤回', 400)
    }

    await cancelPublishTask(id)

    const updatedSchedule = await ScheduleService.withdrawSchedule(id, reason)

    if (schedule.content_id) {
      await ContentModel.updateStatus(schedule.content_id, 'review_approved')
    }

    const response: ApiResponse<Schedule> = {
      success: true,
      data: updatedSchedule,
    }

    res.status(200).json(response)
  }),
)

router.delete(
  '/:id',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的排期ID', 400)
    }

    const defaultReason = '排期已删除（原因未填写）'

    const schedule = await ScheduleModel.findById(id, true)

    if (!schedule) {
      throw createError('排期不存在', 404)
    }

    if (req.user.role === 'editor' && schedule.content?.creator_id !== req.user.id) {
      throw createError('无权撤回此排期', 403)
    }

    if (!['pending', 'approved', 'scheduled'].includes(schedule.status)) {
      throw createError('只有待审核、已通过或已排期的排期才能撤回', 400)
    }

    await cancelPublishTask(id)

    const updatedSchedule = await ScheduleService.withdrawSchedule(id, defaultReason)

    if (schedule.content_id) {
      await ContentModel.updateStatus(schedule.content_id, 'review_approved')
    }

    const response: ApiResponse<Schedule> = {
      success: true,
      data: updatedSchedule,
    }

    res.status(200).json(response)
  }),
)

export default router
