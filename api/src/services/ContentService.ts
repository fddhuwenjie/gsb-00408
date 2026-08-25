import { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import ContentModel from '../models/Content.js'
import ScheduleModel from '../models/Schedule.js'
import ScanRecordModel from '../models/ScanRecord.js'
import ReviewRecordModel from '../models/ReviewRecord.js'
import {
  validateSensitiveWordsHandled,
  validateScheduleTime,
  validateDuplicateSchedule,
  validatePublishedContentDeletable,
} from '../utils/validator.js'
import { scanContent, getLatestScanVersion } from '../utils/scanner.js'
import type {
  Content,
  ContentType,
  ContentStatus,
  Schedule,
  ScanRecord,
  ReviewRecord,
  PaginationParams,
  PaginationResult,
  CreateContentRequest,
  SubmitScheduleRequest,
} from '../../../shared/types.js'

interface ContentWithDetails extends Content {
  scan_records?: ScanRecord[]
  review_records?: ReviewRecord[]
}

export async function createContent(
  userId: number,
  data: CreateContentRequest,
): Promise<Content> {
  if (!data.title || !data.content) {
    throw createError('标题和内容不能为空', 400, 'INVALID_CONTENT')
  }

  const validTypes: ContentType[] = ['article', 'video', 'poster']
  if (!validTypes.includes(data.type)) {
    throw createError('无效的内容类型', 400, 'INVALID_TYPE')
  }

  return ContentModel.create({
    creator_id: userId,
    type: data.type,
    title: data.title,
    content: data.content,
    thumbnail_url: data.thumbnail_url,
  })
}

export async function updateContent(
  contentId: number,
  userId: number,
  data: Partial<CreateContentRequest>,
): Promise<Content> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.creator_id !== userId) {
    throw createError('无权限修改此内容', 403, 'PERMISSION_DENIED')
  }

  if (content.status === 'published') {
    throw createError('已发布内容无法修改', 400, 'CONTENT_PUBLISHED')
  }

  if (data.type) {
    const validTypes: ContentType[] = ['article', 'video', 'poster']
    if (!validTypes.includes(data.type)) {
      throw createError('无效的内容类型', 400, 'INVALID_TYPE')
    }
  }

  const updatedContent = await ContentModel.update(contentId, {
    title: data.title,
    content: data.content,
    thumbnail_url: data.thumbnail_url,
    type: data.type,
  })

  if (!updatedContent) {
    throw createError('更新内容失败', 500, 'UPDATE_FAILED')
  }

  return updatedContent
}

export async function deleteContent(
  contentId: number,
  userId: number,
): Promise<void> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.creator_id !== userId) {
    throw createError('无权限删除此内容', 403, 'PERMISSION_DENIED')
  }

  const deletable = await validatePublishedContentDeletable(contentId)
  if (!deletable.valid) {
    throw createError(deletable.error!, 400, 'CANNOT_DELETE')
  }

  const success = await ContentModel.remove(contentId)
  if (!success) {
    throw createError('删除内容失败', 500, 'DELETE_FAILED')
  }
}

export async function submitForSchedule(
  contentId: number,
  userId: number,
  scheduleData: SubmitScheduleRequest,
): Promise<Schedule> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.creator_id !== userId) {
    throw createError('无权限操作此内容', 403, 'PERMISSION_DENIED')
  }

  const scheduleTimeValid = await validateScheduleTime(scheduleData.schedule_time)
  if (!scheduleTimeValid.valid) {
    throw createError(scheduleTimeValid.error!, 400, 'INVALID_SCHEDULE_TIME')
  }

  const duplicateValid = await validateDuplicateSchedule(
    scheduleData.channel_id,
    scheduleData.schedule_time,
  )
  if (!duplicateValid.valid) {
    throw createError(duplicateValid.error!, 400, 'DUPLICATE_SCHEDULE')
  }

  const latestVersion = await getLatestScanVersion()
  
  return transaction(async (tx) => {
    await ContentModel.update(contentId, {
      scan_version: latestVersion,
    })

    tx.prepare('DELETE FROM scan_records WHERE content_id = ?').run(contentId)

    const matches = await scanContent(content.content, latestVersion)
    if (matches.length > 0) {
      const insertStmt = tx.prepare(`
        INSERT INTO scan_records (content_id, word_id, version, matched_text, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const now = new Date().toISOString()
      
      for (const match of matches) {
        insertStmt.run(
          contentId,
          match.word_id,
          match.version,
          match.matched_text,
          match.position,
          now,
        )
      }
    }

    const sensitiveValid = await validateSensitiveWordsHandled(contentId)
    if (!sensitiveValid.valid) {
      throw createError(sensitiveValid.error!, 400, 'SENSITIVE_WORDS_FOUND')
    }

    await ContentModel.update(contentId, {
      status: 'pending_review',
    })

    const schedule = await ScheduleModel.create({
      content_id: contentId,
      channel_id: scheduleData.channel_id,
      schedule_time: scheduleData.schedule_time,
      status: 'pending',
    })

    return schedule
  })
}

export async function getContentList(
  params?: PaginationParams & {
    status?: string
    creator_id?: number
    type?: string
  },
): Promise<PaginationResult<Content>> {
  if (params?.status) {
    return ContentModel.findByStatus(params.status as ContentStatus, params)
  }
  
  if (params?.creator_id) {
    return ContentModel.findByCreatorId(params.creator_id, params)
  }

  if (params?.type) {
    return ContentModel.findByType(params.type as ContentType, params)
  }

  return ContentModel.findAll(params)
}

export async function getContentDetail(
  contentId: number,
): Promise<ContentWithDetails> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  const [scanRecords, reviewRecords] = await Promise.all([
    ScanRecordModel.findByContentId(contentId, { page: 1, pageSize: 100 }),
    ReviewRecordModel.findByContentId(contentId, { page: 1, pageSize: 100 }),
  ])

  return {
    ...content,
    scan_records: scanRecords.items,
    review_records: reviewRecords.items,
  }
}

export default {
  createContent,
  updateContent,
  deleteContent,
  submitForSchedule,
  getContentList,
  getContentDetail,
}
