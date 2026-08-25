import { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import PublishRecordModel from '../models/PublishRecord.js'
import ScheduleModel from '../models/Schedule.js'
import ContentModel from '../models/Content.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import FailureReviewModel from '../models/FailureReview.js'
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

  if (channel.status !== 'active') {
    throw createError('渠道未激活', 400, 'CHANNEL_INACTIVE')
  }

  return transaction(async () => {
    const publishTime = new Date().toISOString()
    const publishResult = await simulatePublish(content, channel)

    let status: PublishStatus = 'success'
    let resultMessage = '发布成功'

    if (!publishResult.success) {
      status = 'failed'
      resultMessage = publishResult.error || '发布失败'
    }

    const existingRecord = await PublishRecordModel.getLatestByScheduleId(scheduleId)

    let publishRecord: PublishRecord

    if (existingRecord) {
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
      await ScheduleModel.update(scheduleId, {
        status: 'published',
      })

      await ContentModel.update(schedule.content_id, {
        status: 'published',
      })

      await ChannelHealthModel.recalculate(channel.id)
    }

    if (status === 'failed') {
      await ChannelHealthModel.recalculate(channel.id)
      await FailureReviewModel.create({
        publish_record_id: publishRecord.id,
        schedule_id: scheduleId,
      })
    }

    return publishRecord
  })
}

async function simulatePublish(
  content: Content,
  channel: Channel,
): Promise<{ success: boolean; error?: string }> {
  void content
  void channel
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
): Promise<PublishRecord> {
  const schedule = await ScheduleModel.findById(scheduleId)

  if (!schedule) {
    throw createError('排期不存在', 404, 'SCHEDULE_NOT_FOUND')
  }

  const latestRecord = await PublishRecordModel.getLatestByScheduleId(scheduleId)

  if (!latestRecord) {
    return executePublish(scheduleId)
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

  if (channel.status !== 'active') {
    throw createError('渠道未激活', 400, 'CHANNEL_INACTIVE')
  }

  return transaction(async () => {
    const publishTime = new Date().toISOString()
    const publishResult = await simulatePublish(content, channel)

    let status: PublishStatus = 'success'
    let resultMessage = '发布成功'

    if (!publishResult.success) {
      status = 'failed'
      resultMessage = publishResult.error || '发布失败'
    }

    const updated = await PublishRecordModel.update(latestRecord.id, {
      status,
      result: resultMessage,
      publish_time: publishTime,
    })

    if (!updated) {
      throw createError('更新发布记录失败', 500, 'UPDATE_FAILED')
    }

    const publishRecord = updated

    if (status === 'success') {
      await ScheduleModel.update(scheduleId, {
        status: 'published',
      })

      await ContentModel.update(schedule.content_id, {
        status: 'published',
      })

      await ChannelHealthModel.recalculate(channel.id)
    }

    if (status === 'failed') {
      await ChannelHealthModel.recalculate(channel.id)
      await FailureReviewModel.create({
        publish_record_id: publishRecord.id,
        schedule_id: scheduleId,
      })
    }

    return publishRecord
  })
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
  return FailureReviewModel.findByStatus(status, params)
}

export async function resolveFailureReview(
  reviewId: number,
  handlerId: number,
  conclusion: string,
  actionType: FailureReviewAction,
): Promise<FailureReview | null> {
  const resolved = await FailureReviewModel.resolve(reviewId, handlerId, conclusion, actionType)

  if (!resolved) {
    throw createError('失败复核不存在', 404, 'FAILURE_REVIEW_NOT_FOUND')
  }

  if (actionType === 'republish') {
    const scheduleId = resolved.schedule_id
    const schedule = await ScheduleModel.findById(scheduleId)

    if (schedule && (schedule.status === 'failed' || schedule.status === 'scheduled' || schedule.status === 'approved')) {
      await retryPublish(scheduleId)
    }
  }

  return resolved
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
}
