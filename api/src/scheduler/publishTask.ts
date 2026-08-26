import schedule from 'node-schedule'
import db, { transaction } from '../db/index.js'
import ScheduleModel from '../models/Schedule.js'
import PublishRecordModel from '../models/PublishRecord.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import HealthCheckService from '../services/HealthCheckService.js'
import FailureReviewModel from '../models/FailureReview.js'
import AuditService from '../services/AuditService.js'
import type { Schedule } from '../../../shared/types.js'

const scheduledTasks = new Map<number, schedule.Job>()

export const PublishService = {
  async executePublish(scheduleId: number): Promise<void> {
    console.log(`[PublishService] 开始执行发布任务，排期ID: ${scheduleId}`)

    try {
      const scheduleRecord = await ScheduleModel.findById(scheduleId, true)

      if (!scheduleRecord) {
        console.error(`[PublishService] 排期不存在，ID: ${scheduleId}`)
        return
      }

      if (scheduleRecord.status !== 'scheduled') {
        console.log(`[PublishService] 排期状态不是 scheduled，跳过发布，ID: ${scheduleId}`)
        return
      }

      // 发布前健康检查：渠道已降级/停用时不发布，转入待复核
      const check = await HealthCheckService.checkChannelPublishable(scheduleRecord.channel_id)
      if (!check.publishable) {
        console.log(`[PublishService] 渠道不可用（${check.reason}），排期转入待复核，ID: ${scheduleId}`)
        await ScheduleModel.updateStatus(scheduleId, 'pending_review')
        await AuditService.record({
          operatorId: null,
          action: 'schedule_pending_review',
          targetType: 'schedule',
          targetId: scheduleId,
          detail: { reason: check.reason ?? '渠道健康检查未通过', channel_id: scheduleRecord.channel_id },
        })
        return
      }

      const publishTime = new Date().toISOString()
      const result = await simulatePublish(scheduleRecord)

      transaction((tx) => {
        if (result.success) {
          tx.prepare(
            'UPDATE schedules SET status = ?, updated_at = ? WHERE id = ?',
          ).run('published', publishTime, scheduleId)

          tx.prepare(
            'UPDATE contents SET status = ?, updated_at = ? WHERE id = ?',
          ).run('published', publishTime, scheduleRecord.content_id)
        }

        tx.prepare(`
          INSERT INTO publish_records (schedule_id, status, result, publish_time, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          scheduleId,
          result.success ? 'success' : 'failed',
          result.message,
          publishTime,
          publishTime,
        )
      })

      if (result.success) {
        await HealthCheckService.registerSuccess(scheduleRecord.channel_id)
        await ChannelHealthModel.recalculate(scheduleRecord.channel_id)
      } else {
        await handlePublishFailure(scheduleId, scheduleRecord.channel_id, result.message)
      }

      console.log(`[PublishService] 发布任务完成，排期ID: ${scheduleId}`)
    } catch (error) {
      console.error(`[PublishService] 发布任务失败，排期ID: ${scheduleId}`, error)

      const publishTime = new Date().toISOString()
      const message = error instanceof Error ? error.message : '未知错误'

      const publishRecord = await PublishRecordModel.create({
        schedule_id: scheduleId,
        status: 'failed',
        result: message,
        publish_time: publishTime,
      })

      const scheduleRecord = await ScheduleModel.findById(scheduleId)
      if (scheduleRecord) {
        await handlePublishFailure(scheduleId, scheduleRecord.channel_id, message, publishRecord.id)
      }
    } finally {
      scheduledTasks.delete(scheduleId)
    }
  },
}

/**
 * 处理一次发布失败：累计连续失败并按阈值自动降级。
 * 达到阈值触发降级时，渠道被暂停且排期转入待复核；否则排期标记 failed 并生成失败复盘。
 */
async function handlePublishFailure(
  scheduleId: number,
  channelId: number,
  reason: string,
  existingPublishRecordId?: number,
): Promise<void> {
  await ChannelHealthModel.recalculate(channelId)

  const { degraded } = await HealthCheckService.registerFailure(channelId, scheduleId, reason)

  if (!degraded) {
    // 未触发降级：保持既有失败复盘流程
    await ScheduleModel.updateStatus(scheduleId, 'failed')
    const publishRecordId =
      existingPublishRecordId ?? (await PublishRecordModel.getLatestByScheduleId(scheduleId))?.id
    if (publishRecordId) {
      const pending = await FailureReviewModel.findPendingByScheduleId(scheduleId)
      if (!pending) {
        await FailureReviewModel.create({
          publish_record_id: publishRecordId,
          schedule_id: scheduleId,
        })
      }
    }
  }
  // 若已降级，degradeChannel 已将排期转入 pending_review 并记录审计
}

async function simulatePublish(
  scheduleRecord: Schedule,
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const success = Math.random() > 0.1
      resolve({
        success,
        message: success
          ? `内容 "${scheduleRecord.content?.title}" 已成功发布到 ${scheduleRecord.channel?.name}`
          : `发布失败：网络连接超时`,
      })
    }, 1000)
  })
}

export function initPublishScheduler(): void {
  console.log('[PublishScheduler] 初始化定时任务调度器...')

  const now = new Date()

  const stmt = db.prepare(`
    SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at
    FROM schedules
    WHERE status = ? AND schedule_time > ?
    ORDER BY schedule_time ASC
  `)

  const pendingSchedules = stmt.all('scheduled', now.toISOString()) as Schedule[]

  console.log(`[PublishScheduler] 找到 ${pendingSchedules.length} 个待发布的排期任务`)

  for (const scheduleItem of pendingSchedules) {
    schedulePublishTask(scheduleItem.id, scheduleItem.schedule_time)
  }

  console.log('[PublishScheduler] 定时任务调度器初始化完成')
}

export function schedulePublishTask(scheduleId: number, scheduleTime: string): void {
  const scheduleDate = new Date(scheduleTime)
  const now = new Date()

  if (scheduleDate <= now) {
    console.log(`[PublishScheduler] 排期时间已过，立即执行发布，排期ID: ${scheduleId}`)
    PublishService.executePublish(scheduleId)
    return
  }

  if (scheduledTasks.has(scheduleId)) {
    console.log(`[PublishScheduler] 排期任务已存在，先取消旧任务，排期ID: ${scheduleId}`)
    cancelPublishTask(scheduleId)
  }

  const job = schedule.scheduleJob(scheduleDate, () => {
    console.log(`[PublishScheduler] 定时任务触发，排期ID: ${scheduleId}`)
    PublishService.executePublish(scheduleId)
  })

  scheduledTasks.set(scheduleId, job)

  console.log(
    `[PublishScheduler] 已创建定时任务，排期ID: ${scheduleId}，执行时间: ${scheduleDate.toISOString()}`,
  )
}

export function cancelPublishTask(scheduleId: number): void {
  const job = scheduledTasks.get(scheduleId)

  if (job) {
    job.cancel()
    scheduledTasks.delete(scheduleId)
    console.log(`[PublishScheduler] 已取消定时任务，排期ID: ${scheduleId}`)
  } else {
    console.log(`[PublishScheduler] 未找到定时任务，排期ID: ${scheduleId}`)
  }
}

export default {
  initPublishScheduler,
  schedulePublishTask,
  cancelPublishTask,
  PublishService,
}
