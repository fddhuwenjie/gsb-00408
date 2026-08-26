import db, { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import PublishRecordModel from '../models/PublishRecord.js'
import ScheduleModel from '../models/Schedule.js'
import ContentModel from '../models/Content.js'
import ChannelModel from '../models/Channel.js'
import FailureReviewModel from '../models/FailureReview.js'
import AuditLogModel from '../models/AuditLog.js'
import * as HealthService from './HealthService.js'
import { validateScheduleTime, validateDuplicateSchedule } from '../utils/validator.js'
import type {
  PublishRecord,
  Content,
  Channel,
  PaginationParams,
  PaginationResult,
  PublishStatus,
  FailureReview,
  FailureReviewStatus,
  FailureReviewAction,
  Schedule,
} from '../../../shared/types.js'

type PublishSimulator = (
  content: Content,
  channel: Channel,
) => Promise<{ success: boolean; error?: string }>

let publishSimulator: PublishSimulator = defaultSimulator

export function setPublishSimulator(simulator: PublishSimulator | null): void {
  publishSimulator = simulator ?? defaultSimulator
}

async function defaultSimulator(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const random = Math.random()
      if (random > 0.1) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: '模拟发布失败：网络超时' })
      }
    }, 100)
  })
}

async function writeAudit(
  operatorId: number | null | undefined,
  action: string,
  targetType: string,
  targetId: number,
  detail?: unknown,
): Promise<void> {
  try {
    await AuditLogModel.create({
      operator_id: operatorId ?? null,
      action,
      target_type: targetType,
      target_id: targetId,
      detail,
    })
  } catch (error) {
    console.error('[PublishService] 审计日志写入失败:', error)
  }
}

async function createFailureReviewIfAbsent(
  scheduleId: number,
  publishRecordId: number,
  reason: string,
): Promise<void> {
  const pending = await FailureReviewModel.findPendingByScheduleId(scheduleId)
  if (pending) return
  await FailureReviewModel.create({
    publish_record_id: publishRecordId,
    schedule_id: scheduleId,
    reason,
  })
}

export async function executePublish(
  scheduleId: number,
  operatorId?: number | null,
): Promise<PublishRecord> {
  const schedule = await ScheduleModel.findById(scheduleId)

  if (!schedule) {
    throw createError('排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  if (schedule.status === 'withdrawn') {
    throw createError('排期已撤回，无法发布', 400, 'SCHEDULE_WITHDRAWN')
  }

  if (schedule.status === 'published') {
    throw createError('排期已发布', 400, 'SCHEDULE_PUBLISHED')
  }

  if (
    schedule.status !== 'approved' &&
    schedule.status !== 'scheduled' &&
    schedule.status !== 'publishing' &&
    schedule.status !== 'failed'
  ) {
    throw createError('排期未通过审核，无法发布', 400, 'SCHEDULE_NOT_APPROVED')
  }

  const content = await ContentModel.findById(schedule.content_id)
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  const channel = await ChannelModel.findById(schedule.channel_id)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const healthCheck = await HealthService.checkBeforePublish(channel.id)
  if (!healthCheck.healthy) {
    const publishTime = new Date().toISOString()
    const blockReason = healthCheck.reason || '渠道健康检查未通过'
    const publishRecord = await PublishRecordModel.create({
      schedule_id: scheduleId,
      status: 'failed',
      result: `发布前健康检查未通过：${blockReason}`,
      publish_time: publishTime,
    })
    await ScheduleModel.updateStatus(scheduleId, 'failed')
    await createFailureReviewIfAbsent(scheduleId, publishRecord.id, blockReason)
    await writeAudit(operatorId ?? null, 'publish.blocked', 'schedule', scheduleId, {
      channel_id: channel.id,
      channel_name: channel.name,
      reason: blockReason,
    })
    return publishRecord
  }

  await ScheduleModel.updateStatus(scheduleId, 'publishing')

  const publishTime = new Date().toISOString()
  const publishResult = await publishSimulator(content, channel)

  let status: PublishStatus = 'success'
  let resultMessage = '发布成功'

  if (!publishResult.success) {
    status = 'failed'
    resultMessage = publishResult.error || '发布失败'
  }

  const existingRecord = await PublishRecordModel.getLatestByScheduleId(scheduleId)

  let publishRecord: PublishRecord

  if (existingRecord && existingRecord.status !== 'success') {
    const updated = await PublishRecordModel.update(existingRecord.id, {
      status,
      result: resultMessage,
      publish_time: publishTime,
    })

    if (!updated) {
      throw createError('更新发布记录失败', 500, 'UPDATE_FAILED')
    }

    publishRecord = updated
  } else {
    publishRecord = await PublishRecordModel.create({
      schedule_id: scheduleId,
      status,
      result: resultMessage,
      publish_time: publishTime,
    })
  }

  if (status === 'success') {
    await ScheduleModel.update(scheduleId, { status: 'published' })
    await ContentModel.update(schedule.content_id, { status: 'published' })
    await HealthService.handlePublishSuccess(channel.id, operatorId ?? null)
    await writeAudit(operatorId ?? null, 'publish.success', 'publish_record', publishRecord.id, {
      schedule_id: scheduleId,
      channel_id: channel.id,
      channel_name: channel.name,
      content_title: content.title,
    })
  } else {
    const { degraded } = await HealthService.handlePublishFailure(
      channel.id,
      resultMessage,
      operatorId ?? null,
    )
    await ScheduleModel.updateStatus(scheduleId, 'failed')
    const reviewReason = degraded
      ? `${resultMessage}；渠道连续失败达到阈值已自动降级暂停，任务转入待复核`
      : resultMessage
    await createFailureReviewIfAbsent(scheduleId, publishRecord.id, reviewReason)
    await writeAudit(operatorId ?? null, 'publish.failed', 'publish_record', publishRecord.id, {
      schedule_id: scheduleId,
      channel_id: channel.id,
      channel_name: channel.name,
      content_title: content.title,
      reason: resultMessage,
      degraded,
    })
  }

  return publishRecord
}

export async function getPublishRecords(
  params?: PaginationParams & {
    schedule_id?: number
    status?: PublishStatus
    start_date?: string
    end_date?: string
    publish_start_date?: string
    publish_end_date?: string
    channel_id?: number
  },
): Promise<PaginationResult<PublishRecord>> {
  if (params?.schedule_id) {
    return PublishRecordModel.findByScheduleId(params.schedule_id, params)
  }

  if (params?.status) {
    return PublishRecordModel.findByStatus(params.status, params)
  }

  if (params?.channel_id) {
    return PublishRecordModel.findByChannelId(params.channel_id, params)
  }

  if (params?.start_date && params?.end_date) {
    return PublishRecordModel.findByDateRange(
      params.start_date,
      params.end_date,
      params,
    )
  }

  if (params?.publish_start_date && params?.publish_end_date) {
    return PublishRecordModel.findByPublishTimeRange(
      params.publish_start_date,
      params.publish_end_date,
      params,
    )
  }

  return PublishRecordModel.findAll(params)
}

export async function getPublishRecordDetail(
  recordId: number,
): Promise<PublishRecord> {
  const record = await PublishRecordModel.findById(recordId, true)

  if (!record) {
    throw createError('发布记录不存在', 404, 'RECORD_NOT_FOUND')
  }

  return record
}

export async function getPublishStats(
  startDate: string,
  endDate: string,
): Promise<{
  total: number
  success: number
  failed: number
  success_rate: number
}> {
  const records = await PublishRecordModel.findByDateRange(startDate, endDate, {
    page: 1,
    pageSize: 10000,
  })

  const total = records.items.length
  const success = records.items.filter((r) => r.status === 'success').length
  const failed = records.items.filter((r) => r.status === 'failed').length
  const success_rate = total > 0 ? success / total : 0

  return {
    total,
    success,
    failed,
    success_rate,
  }
}

export async function retryPublish(
  scheduleId: number,
  operatorId?: number | null,
): Promise<PublishRecord> {
  const schedule = await ScheduleModel.findById(scheduleId)

  if (!schedule) {
    throw createError('排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  const latestRecord = await PublishRecordModel.getLatestByScheduleId(scheduleId)

  if (latestRecord?.status === 'success') {
    throw createError('该排期已发布成功，无需重试', 400, 'ALREADY_SUCCESS')
  }

  const content = await ContentModel.findById(schedule.content_id)
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  const channel = await ChannelModel.findById(schedule.channel_id)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const healthCheck = await HealthService.checkBeforePublish(channel.id)
  if (!healthCheck.healthy) {
    throw createError(
      healthCheck.reason || '渠道健康检查未通过，无法重试发布',
      400,
      healthCheck.code || 'CHANNEL_UNHEALTHY',
    )
  }

  await writeAudit(operatorId ?? null, 'publish.retry', 'schedule', scheduleId, {
    channel_id: channel.id,
    channel_name: channel.name,
  })

  return executePublish(scheduleId, operatorId)
}

export async function getFailureReviews(
  params?: PaginationParams & { status?: string },
): Promise<PaginationResult<FailureReview>> {
  let result: PaginationResult<FailureReview>
  if (params?.status) {
    result = await FailureReviewModel.findByStatus(params.status as FailureReviewStatus, params)
  } else {
    result = await FailureReviewModel.findAll(params)
  }

  const items = await Promise.all(
    result.items.map(async (item) => {
      const detailed = await FailureReviewModel.findById(item.id, true)
      return detailed ?? item
    }),
  )

  return { ...result, items }
}

export async function getFailureReviewsByStatus(
  status: FailureReviewStatus,
  params?: PaginationParams,
): Promise<PaginationResult<FailureReview>> {
  return getFailureReviews({ ...params, status })
}

export async function getFailureReviewDetail(reviewId: number): Promise<FailureReview> {
  const review = await FailureReviewModel.findById(reviewId, true)
  if (!review) {
    throw createError('失败复核记录不存在', 404, 'FAILURE_REVIEW_NOT_FOUND')
  }
  return review
}

export async function resolveFailureReview(
  reviewId: number,
  handlerId: number,
  conclusion: string,
  actionType: FailureReviewAction,
  scheduleTime?: string,
): Promise<{ review: FailureReview; schedule?: Schedule }> {
  const review = await FailureReviewModel.findById(reviewId, true)
  if (!review) {
    throw createError('失败复核记录不存在', 404, 'FAILURE_REVIEW_NOT_FOUND')
  }

  if (review.status === 'resolved') {
    throw createError('该失败复核已处理', 400, 'FAILURE_REVIEW_ALREADY_RESOLVED')
  }

  if (!conclusion || conclusion.trim().length === 0) {
    throw createError('处理结论不能为空', 400, 'EMPTY_CONCLUSION')
  }

  const schedule = await ScheduleModel.findById(review.schedule_id, true)
  if (!schedule) {
    throw createError('排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  const channel = await ChannelModel.findById(schedule.channel_id)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  // 第一步：全部前置校验（只读）。任一失败直接抛错，不产生任何写入，
  // 复核状态、排期状态、处理结论均保持原样。
  if (actionType === 'republish' || actionType === 'reschedule') {
    const healthCheck = await HealthService.checkBeforePublish(channel.id)
    if (!healthCheck.healthy) {
      throw createError(
        healthCheck.reason || '渠道健康检查未通过',
        400,
        healthCheck.code || 'CHANNEL_UNHEALTHY',
      )
    }
  }

  let normalizedScheduleTime: string | undefined
  if (actionType === 'reschedule') {
    if (!scheduleTime) {
      throw createError('重新排期必须提供新的排期时间', 400, 'SCHEDULE_TIME_REQUIRED')
    }

    const timeCheck = await validateScheduleTime(scheduleTime)
    if (!timeCheck.valid) {
      throw createError(timeCheck.error!, 400, 'INVALID_SCHEDULE_TIME')
    }
    normalizedScheduleTime = new Date(scheduleTime).toISOString()

    const duplicateCheck = await validateDuplicateSchedule(
      schedule.channel_id,
      normalizedScheduleTime,
      schedule.id,
    )
    if (!duplicateCheck.valid) {
      throw createError(duplicateCheck.error!, 400, 'DUPLICATE_SCHEDULE')
    }
  }

  // 第二步：执行业务动作。重新发布若实际发布失败，复核记录保持待处理。
  if (actionType === 'republish') {
    const record = await retryPublish(review.schedule_id, handlerId)
    if (record.status !== 'success') {
      throw createError(
        '重新发布失败：渠道发布仍未成功，复核记录保持待处理',
        409,
        'REPUBLISH_FAILED',
      )
    }
  }

  // 第三步：所有动作均已成功后，在同一个事务内统一完成排期变更、
  // 复核状态变更与审计写入；任一步失败全部回滚，审计失败不会被静默吞掉。
  const now = new Date().toISOString()
  const trimmedConclusion = conclusion.trim()

  transaction(() => {
    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (operator_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    if (actionType === 'reschedule' && normalizedScheduleTime) {
      const scheduleResult = db
        .prepare(
          `UPDATE schedules
           SET schedule_time = ?, status = 'scheduled', updated_at = ?
           WHERE id = ? AND status != 'withdrawn'`,
        )
        .run(normalizedScheduleTime, now, review.schedule_id)

      if (scheduleResult.changes === 0) {
        throw createError('更新排期失败，排期状态已变更', 409, 'SCHEDULE_STATE_CHANGED')
      }

      insertAudit.run(
        handlerId,
        'schedule.reschedule',
        'schedule',
        review.schedule_id,
        JSON.stringify({
          failure_review_id: reviewId,
          channel_id: schedule.channel_id,
          channel_name: channel.name,
          schedule_time: normalizedScheduleTime,
        }),
        now,
      )
    }

    const resolveResult = db
      .prepare(
        `UPDATE failure_reviews
         SET handler_id = ?, conclusion = ?, action_type = ?, status = 'resolved', resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(handlerId, trimmedConclusion, actionType, now, reviewId)

    if (resolveResult.changes === 0) {
      throw createError('复核记录已被其他操作处理或状态已变更', 409, 'FAILURE_REVIEW_STATE_CHANGED')
    }

    insertAudit.run(
      handlerId,
      'failure_review.resolve',
      'failure_review',
      reviewId,
      JSON.stringify({
        schedule_id: review.schedule_id,
        action_type: actionType,
        conclusion: trimmedConclusion,
      }),
      now,
    )
  })

  const detailed = await FailureReviewModel.findById(reviewId, true)
  const updatedSchedule =
    actionType === 'reschedule'
      ? ((await ScheduleModel.findById(review.schedule_id)) ?? undefined)
      : undefined

  return { review: detailed!, schedule: updatedSchedule }
}

export default {
  executePublish,
  getPublishRecords,
  getPublishRecordDetail,
  getPublishStats,
  retryPublish,
  getFailureReviews,
  getFailureReviewsByStatus,
  getFailureReviewDetail,
  resolveFailureReview,
  setPublishSimulator,
}
