import schedule from 'node-schedule'
import db from '../db/index.js'
import * as PublishService from '../services/PublishService.js'
import type { Schedule } from '../../../shared/types.js'

const scheduledTasks = new Map<number, schedule.Job>()

export const SchedulerService = {
  async executePublish(scheduleId: number): Promise<void> {
    console.log(`[PublishScheduler] 开始执行发布任务，排期ID: ${scheduleId}`)
    try {
      await PublishService.executePublish(scheduleId, null)
      console.log(`[PublishScheduler] 发布任务处理完成，排期ID: ${scheduleId}`)
    } catch (error) {
      console.error(`[PublishScheduler] 发布任务异常，排期ID: ${scheduleId}`, error)
    } finally {
      scheduledTasks.delete(scheduleId)
    }
  },
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
    void SchedulerService.executePublish(scheduleId)
    return
  }

  if (scheduledTasks.has(scheduleId)) {
    console.log(`[PublishScheduler] 排期任务已存在，先取消旧任务，排期ID: ${scheduleId}`)
    cancelPublishTask(scheduleId)
  }

  const job = schedule.scheduleJob(scheduleDate, () => {
    console.log(`[PublishScheduler] 定时任务触发，排期ID: ${scheduleId}`)
    void SchedulerService.executePublish(scheduleId)
  })

  if (job) {
    scheduledTasks.set(scheduleId, job)
    console.log(
      `[PublishScheduler] 已创建定时任务，排期ID: ${scheduleId}，执行时间: ${scheduleDate.toISOString()}`,
    )
  }
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
  SchedulerService,
}
