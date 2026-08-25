import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import ContentModel from '../models/Content.js'
import ScheduleModel from '../models/Schedule.js'
import { scanContent, saveScanRecords, getLatestScanVersion, clearScanRecords } from '../utils/scanner.js'
import {
  validateSensitiveWordsHandled,
  validateScheduleTime,
  validateDuplicateSchedule,
  validatePublishedContentDeletable,
} from '../utils/validator.js'
import type {
  Content,
  CreateContentRequest,
  SubmitScheduleRequest,
  PaginationParams,
  PaginationResult,
  ApiResponse,
  ContentType,
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

    let result: PaginationResult<Content>

    if (status) {
      result = await ContentModel.findByStatus(status as Content['status'], { page, pageSize })
    } else if (type) {
      result = await ContentModel.findByType(type as ContentType, { page, pageSize })
    } else if (req.user?.role === 'editor') {
      result = await ContentModel.findByCreatorId(req.user.id, { page, pageSize })
    } else {
      result = await ContentModel.findAll({ page, pageSize })
    }

    const response: ApiResponse<PaginationResult<Content>> = {
      success: true,
      data: result,
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

    const { type, title, content, thumbnail_url } = req.body as CreateContentRequest

    if (!type || !title || !content) {
      throw createError('内容类型、标题和内容不能为空', 400)
    }

    if (!['article', 'video', 'poster'].includes(type)) {
      throw createError('内容类型必须是 article、video 或 poster', 400)
    }

    const latestVersion = await getLatestScanVersion()
    const matches = await scanContent(content, latestVersion)

    const newContent = await ContentModel.create({
      creator_id: req.user.id,
      type,
      title,
      content,
      thumbnail_url,
      status: 'draft',
      scan_version: latestVersion,
    })

    if (matches.length > 0) {
      await saveScanRecords(newContent.id, matches)
    }

    const response: ApiResponse<Content> = {
      success: true,
      data: newContent,
    }

    res.status(201).json(response)
  }),
)

router.get(
  '/:id',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的内容ID', 400)
    }

    const content = await ContentModel.findById(id)

    if (!content) {
      throw createError('内容不存在', 404)
    }

    if (req.user?.role === 'editor' && content.creator_id !== req.user.id) {
      throw createError('无权查看此内容', 403)
    }

    const response: ApiResponse<Content> = {
      success: true,
      data: content,
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
      throw createError('无效的内容ID', 400)
    }

    const content = await ContentModel.findById(id)

    if (!content) {
      throw createError('内容不存在', 404)
    }

    if (req.user.role === 'editor' && content.creator_id !== req.user.id) {
      throw createError('无权编辑此内容', 403)
    }

    if (content.status === 'published') {
      throw createError('已发布的内容不能编辑', 400)
    }

    const { title, content: newContent, thumbnail_url } = req.body as Partial<CreateContentRequest>

    const updateParams: Parameters<typeof ContentModel.update>[1] = {}

    if (title !== undefined) {
      updateParams.title = title
    }
    if (newContent !== undefined) {
      updateParams.content = newContent
      const latestVersion = await getLatestScanVersion()
      updateParams.scan_version = latestVersion
      await clearScanRecords(id)
      const matches = await scanContent(newContent, latestVersion)
      if (matches.length > 0) {
        await saveScanRecords(id, matches)
      }
    }
    if (thumbnail_url !== undefined) {
      updateParams.thumbnail_url = thumbnail_url
    }

    const updatedContent = await ContentModel.update(id, updateParams)

    const response: ApiResponse<Content> = {
      success: true,
      data: updatedContent!,
    }

    res.status(200).json(response)
  }),
)

router.delete(
  '/:id',
  requireRole('editor', 'admin'),
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

    if (req.user.role === 'editor' && content.creator_id !== req.user.id) {
      throw createError('无权删除此内容', 403)
    }

    const deletable = await validatePublishedContentDeletable(id)
    if (!deletable.valid) {
      throw createError(deletable.error!, 400)
    }

    const deleted = await ContentModel.remove(id)

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted },
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/:id/submit',
  requireRole('editor', 'admin'),
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

    if (req.user.role === 'editor' && content.creator_id !== req.user.id) {
      throw createError('无权提交此内容', 403)
    }

    if (!['draft', 'review_rejected'].includes(content.status)) {
      throw createError('只有草稿或已驳回的内容可以提交排期', 400)
    }

    const { channel_id, schedule_time } = req.body as SubmitScheduleRequest

    if (!channel_id || !schedule_time) {
      throw createError('渠道ID和排期时间不能为空', 400)
    }

    const sensitiveCheck = await validateSensitiveWordsHandled(id)
    if (!sensitiveCheck.valid) {
      throw createError(sensitiveCheck.error!, 400)
    }

    const timeCheck = await validateScheduleTime(schedule_time)
    if (!timeCheck.valid) {
      throw createError(timeCheck.error!, 400)
    }

    const duplicateCheck = await validateDuplicateSchedule(channel_id, schedule_time)
    if (!duplicateCheck.valid) {
      throw createError(duplicateCheck.error!, 400)
    }

    const schedule = await ScheduleModel.create({
      content_id: id,
      channel_id,
      schedule_time,
      status: 'pending',
    })

    await ContentModel.updateStatus(id, 'pending_review')

    const response: ApiResponse<typeof schedule> = {
      success: true,
      data: schedule,
    }

    res.status(201).json(response)
  }),
)

export default router
