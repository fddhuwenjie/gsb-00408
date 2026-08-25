import schedule from 'node-schedule'
import db, { transaction } from '../db/index.js'
import ScheduleModel from '../models/Schedule.js'
import PublishRecordModel from '../models/PublishRecord.js'
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

      const publishTime = new Date().toISOString()
      const result = await simulatePublish(scheduleRecord)

      transaction((tx) => {
        tx.prepare(
          'UPDATE schedules SET status = ?, updated_at = ? WHERE id = ?',
        ).run('published', publishTime, scheduleId)

        tx.prepare(
          'UPDATE contents SET status = ?, updated_at = ? WHERE id = ?',
        ).run('published', publishTime, scheduleRecord.content_id)

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

      console.log(`[PublishService] 发布任务完成，排期ID: ${scheduleId}`)
    } catch (error) {
      console.error(`[PublishService] 发布任务失败，排期ID: ${scheduleId}`, error)

      const publishTime = new Date().toISOString()

      await PublishRecordModel.create({
        schedule_id: scheduleId,
        status: 'failed',
        result: error instanceof Error ? error.message : '未知错误',
        publish_time: publishTime,
      })

      await ScheduleModel.updateStatus(scheduleId, 'published')
    } finally {
      scheduledTasks.delete(scheduleId)
    }
  },
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
