import db, { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import PublishRecordModel from '../models/PublishRecord.js'
import ScheduleModel from '../models/Schedule.js'
import ContentModel from '../models/Content.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import FailureReviewModel from '../models/FailureReview.js'
import AuditLogModel from '../models/AuditLog.js'
import * as HealthCheckService from './HealthCheckService.js'
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
} from '../../../shared/types.js'

export async function executePublish(
  scheduleId: number,
  operatorId?: number,
  ipAddress?: string,
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

  if (schedule.status !== 'approved' && schedule.status !== 'scheduled') {
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

  const healthCheck = await HealthCheckService.checkChannelHealthBeforePublish(schedule.channel_id)
  if (!healthCheck.allowed) {
    const blockNow = new Date().toISOString()
    transaction(() => {
      db.prepare("UPDATE schedules SET status = 'pending_review', updated_at = ? WHERE id = ?").run(blockNow, scheduleId)
      const existing = db.prepare("SELECT id FROM failure_reviews WHERE schedule_id = ? AND status = 'pending'").get(scheduleId) as { id: number } | undefined
      if (!existing) {
        db.prepare(`
          INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status, created_at)
          VALUES (NULL, ?, ?, 'pending', ?)
        `).run(scheduleId, healthCheck.reason || '渠道健康检查未通过', blockNow)
      }
    })

    await AuditLogModel.create({
      operator_id: operatorId ?? null,
      action: 'schedule_publish_blocked',
      resource_type: 'schedule',
      resource_id: scheduleId,
      detail: `排期发布被拦截: ${healthCheck.reason}，已转入待复核`,
      ip_address: ipAddress ?? null,
    })

    throw createError(healthCheck.reason || '渠道健康检查未通过，任务已转入待复核', 503, 'CHANNEL_DEGRADED')
  }

  const publishTime = new Date().toISOString()
  const publishResult = await simulatePublish(content, channel)

  const status: PublishStatus = publishResult.success ? 'success' : 'failed'
  const resultMessage = publishResult.success ? '发布成功' : (publishResult.error || '发布失败')

  const publishRecord = transaction(() => {
    const existingRecord = db.prepare('SELECT * FROM publish_records WHERE schedule_id = ? ORDER BY id DESC LIMIT 1').get(scheduleId) as Record<string, unknown> | undefined

    let recordId: number
    if (existingRecord) {
      recordId = existingRecord.id as number
      db.prepare('UPDATE publish_records SET status = ?, result = ?, publish_time = ? WHERE id = ?')
        .run(status, resultMessage, publishTime, recordId)
    } else {
      const result = db.prepare(`
        INSERT INTO publish_records (schedule_id, status, result, publish_time, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, status, resultMessage, publishTime, publishTime)
      recordId = result.lastInsertRowid as number
    }

    if (status === 'success') {
      db.prepare("UPDATE schedules SET status = 'published', updated_at = ? WHERE id = ?").run(publishTime, scheduleId)
      db.prepare("UPDATE contents SET status = 'published', updated_at = ? WHERE id = ?").run(publishTime, schedule.content_id)
    }

    const record = db.prepare('SELECT * FROM publish_records WHERE id = ?').get(recordId) as PublishRecord
    return record
  })

  if (status === 'success') {
    await ChannelHealthModel.recalculate(channel.id)
    await HealthCheckService.recordPublishSuccess(channel.id, operatorId, ipAddress)
  }

  if (status === 'failed') {
    await ChannelHealthModel.recalculate(channel.id)
    const { degraded } = await HealthCheckService.recordPublishFailure(
      channel.id,
      resultMessage,
      scheduleId,
      operatorId,
      ipAddress,
    )

    transaction(() => {
      const now = new Date().toISOString()
      const newStatus = degraded ? 'pending_review' : 'failed'
      db.prepare("UPDATE schedules SET status = ?, updated_at = ? WHERE id = ?").run(newStatus, now, scheduleId)
      const existing = db.prepare("SELECT id FROM failure_reviews WHERE schedule_id = ? AND status = 'pending'").get(scheduleId) as { id: number } | undefined
      if (!existing) {
        db.prepare(`
          INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status, created_at)
          VALUES (?, ?, ?, 'pending', ?)
        `).run(publishRecord.id, scheduleId, resultMessage, now)
      }
    })
  }

  return publishRecord
}

async function simulatePublish(
  content: Content,
  channel: Channel,
): Promise<{ success: boolean; error?: string }> {
  void content
  void channel
  return new Promise((resolve) => {
    setTimeout(() => {
      if (process.env.PUBLISH_FORCE_FAILURE === 'true') {
        resolve({ success: false, error: `注入失败：渠道 ${channel.name} 发布异常（测试模式）` })
        return
      }
      if (process.env.PUBLISH_FORCE_SUCCESS === 'true') {
        resolve({ success: true })
        return
      }
      const random = Math.random()
      if (random > 0.1) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: '模拟发布失败：网络超时' })
      }
    }, 50)
  })
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
  operatorId?: number,
  ipAddress?: string,
): Promise<PublishRecord> {
  const schedule = await ScheduleModel.findById(scheduleId)

  if (!schedule) {
    throw createError('排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  const latestRecord = await PublishRecordModel.getLatestByScheduleId(scheduleId)

  if (!latestRecord) {
    return executePublish(scheduleId, operatorId, ipAddress)
  }

  if (latestRecord.status === 'success') {
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

  const healthCheck = await HealthCheckService.checkChannelHealthBeforePublish(schedule.channel_id)
  if (!healthCheck.allowed) {
    throw createError(healthCheck.reason || '渠道健康检查未通过', 503, 'CHANNEL_DEGRADED')
  }

  const publishTime = new Date().toISOString()
  const publishResult = await simulatePublish(content, channel)
  const status: PublishStatus = publishResult.success ? 'success' : 'failed'
  const resultMessage = publishResult.success ? '发布成功' : (publishResult.error || '发布失败')

  const publishRecord = transaction(() => {
    db.prepare('UPDATE publish_records SET status = ?, result = ?, publish_time = ? WHERE id = ?')
      .run(status, resultMessage, publishTime, latestRecord.id)

    if (status === 'success') {
      db.prepare("UPDATE schedules SET status = 'published', updated_at = ? WHERE id = ?").run(publishTime, scheduleId)
      db.prepare("UPDATE contents SET status = 'published', updated_at = ? WHERE id = ?").run(publishTime, schedule.content_id)
    }

    return db.prepare('SELECT * FROM publish_records WHERE id = ?').get(latestRecord.id) as PublishRecord
  })

  if (status === 'success') {
    await ChannelHealthModel.recalculate(channel.id)
    await HealthCheckService.recordPublishSuccess(channel.id, operatorId, ipAddress)
  }

  if (status === 'failed') {
    await ChannelHealthModel.recalculate(channel.id)
    const { degraded } = await HealthCheckService.recordPublishFailure(
      channel.id,
      resultMessage,
      scheduleId,
      operatorId,
      ipAddress,
    )

    transaction(() => {
      const now = new Date().toISOString()
      const newStatus = degraded ? 'pending_review' : 'failed'
      db.prepare("UPDATE schedules SET status = ?, updated_at = ? WHERE id = ?").run(newStatus, now, scheduleId)
    })
  }

  return publishRecord
}

export async function getFailureReviews(
  params?: PaginationParams,
): Promise<PaginationResult<FailureReview>> {
  return FailureReviewModel.findAll(params)
}

export async function getFailureReviewsByStatus(
  status: FailureReviewStatus,
  params?: PaginationParams,
): Promise<PaginationResult<FailureReview>> {
  if (status === 'pending') {
    return FailureReviewModel.findAllPendingWithRelations(params)
  }
  return FailureReviewModel.findByStatus(status, params)
}

export async function resolveFailureReview(
  reviewId: number,
  handlerId: number,
  conclusion: string,
  actionType: FailureReviewAction,
  ipAddress?: string,
): Promise<FailureReview | null> {
  const resolved = await FailureReviewModel.resolve(reviewId, handlerId, conclusion, actionType)

  if (!resolved) {
    throw createError('失败复核不存在', 404, 'FAILURE_REVIEW_NOT_FOUND')
  }

  await AuditLogModel.create({
    operator_id: handlerId,
    action: 'failure_review_resolve',
    resource_type: 'failure_review',
    resource_id: reviewId,
    detail: `处理失败复核 #${reviewId}，结论: ${conclusion}，操作: ${actionType}`,
    ip_address: ipAddress ?? null,
  })

  if (actionType === 'republish') {
    const scheduleId = resolved.schedule_id
    const schedule = await ScheduleModel.findById(scheduleId)

    if (schedule && (schedule.status === 'failed' || schedule.status === 'scheduled' || schedule.status === 'approved' || schedule.status === 'pending_review')) {
      await ScheduleModel.update(scheduleId, { status: 'scheduled' })
      await retryPublish(scheduleId, handlerId, ipAddress)
    }
  }

  return resolved
}

export async function rescheduleFromReview(
  reviewId: number,
  scheduleTime: string,
  handlerId: number,
  ipAddress?: string,
): Promise<FailureReview | null> {
  const review = await FailureReviewModel.findById(reviewId, true)
  if (!review) {
    throw createError('复核记录不存在', 404, 'REVIEW_NOT_FOUND')
  }

  if (review.status === 'resolved') {
    throw createError('该复核记录已处理', 400, 'REVIEW_ALREADY_RESOLVED')
  }

  const schedule = review.schedule
  if (!schedule) {
    throw createError('关联排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  const healthCheck = await HealthCheckService.checkChannelHealthBeforePublish(schedule.channel_id)
  if (!healthCheck.allowed) {
    throw createError(healthCheck.reason || '渠道健康检查未通过，无法重新排期', 503, 'CHANNEL_DEGRADED')
  }

  await ScheduleModel.update(schedule.id, {
    schedule_time: scheduleTime,
    status: 'scheduled',
  })

  const updated = await FailureReviewModel.update(reviewId, {
    handler_id: handlerId,
    conclusion: `人工重新排期至 ${scheduleTime}`,
    action_type: 'reschedule',
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  })

  await AuditLogModel.create({
    operator_id: handlerId,
    action: 'failure_review_reschedule',
    resource_type: 'failure_review',
    resource_id: reviewId,
    detail: `复核 #${reviewId} 重新排期，排期ID: ${schedule.id}，新时间: ${scheduleTime}`,
    ip_address: ipAddress ?? null,
  })

  await AuditLogModel.create({
    operator_id: handlerId,
    action: 'schedule_reschedule',
    resource_type: 'schedule',
    resource_id: schedule.id,
    detail: `从失败复核重新排期至 ${scheduleTime}`,
    ip_address: ipAddress ?? null,
  })

  return updated
}

export default {
  executePublish,
  getPublishRecords,
  getPublishRecordDetail,
  getPublishStats,
  retryPublish,
  getFailureReviews,
  getFailureReviewsByStatus,
  resolveFailureReview,
  rescheduleFromReview,
}
