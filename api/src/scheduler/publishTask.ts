import schedule from 'node-schedule'
import db from '../db/index.js'
import ScheduleModel from '../models/Schedule.js'
import * as PublishService from '../services/PublishService.js'
import * as HealthCheckService from '../services/HealthCheckService.js'
import type { Schedule } from '../../../shared/types.js'

const scheduledTasks = new Map<number, schedule.Job>()

const HEARTBEAT_CHECK_INTERVAL_MINUTES = 5
const HEARTBEAT_STALE_THRESHOLD_MINUTES = 10

export const PublishTaskService = {
  async executePublish(scheduleId: number): Promise<void> {
    console.log(`[PublishScheduler] 开始执行发布任务，排期ID: ${scheduleId}`)

    try {
      await PublishService.executePublish(scheduleId)
      console.log(`[PublishScheduler] 发布任务完成，排期ID: ${scheduleId}`)
    } catch (error) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      if (err.statusCode === 503 && err.code === 'CHANNEL_DEGRADED') {
        console.warn(`[PublishScheduler] 渠道已降级，排期 ${scheduleId} 已转入待复核: ${err.message}`)
      } else {
        console.error(`[PublishScheduler] 发布任务失败，排期ID: ${scheduleId}`, error)
      }
    } finally {
      scheduledTasks.delete(scheduleId)
    }
  },
}

let heartbeatCheckJob: schedule.Job | null = null

export function initHeartbeatChecker(): void {
  console.log('[HeartbeatChecker] 初始化心跳巡检任务...')

  heartbeatCheckJob = schedule.scheduleJob(`*/${HEARTBEAT_CHECK_INTERVAL_MINUTES} * * * *`, async () => {
    console.log('[HeartbeatChecker] 开始检查渠道心跳...')
    try {
      const { degraded } = await HealthCheckService.checkStaleHeartbeats(HEARTBEAT_STALE_THRESHOLD_MINUTES)
      if (degraded.length > 0) {
        console.warn(`[HeartbeatChecker] ${degraded.length} 个渠道因心跳超时被自动降级`)
        for (const health of degraded) {
          const channel = health.channel
          if (channel) {
            const pendingSchedules = await ScheduleModel.findByChannelIdAndTimeRange(
              health.channel_id,
              new Date().toISOString(),
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              { page: 1, pageSize: 100 },
            )
            for (const s of pendingSchedules.items) {
              cancelPublishTask(s.id)
            }
          }
        }
      } else {
        console.log('[HeartbeatChecker] 所有渠道心跳正常')
      }
    } catch (error) {
      console.error('[HeartbeatChecker] 心跳检查失败:', error)
    }
  })

  console.log(`[HeartbeatChecker] 心跳巡检任务已启动，每 ${HEARTBEAT_CHECK_INTERVAL_MINUTES} 分钟检查一次`)
}

export function stopHeartbeatChecker(): void {
  if (heartbeatCheckJob) {
    heartbeatCheckJob.cancel()
    heartbeatCheckJob = null
    console.log('[HeartbeatChecker] 心跳巡检任务已停止')
  }
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
    PublishTaskService.executePublish(scheduleId)
    return
  }

  if (scheduledTasks.has(scheduleId)) {
    console.log(`[PublishScheduler] 排期任务已存在，先取消旧任务，排期ID: ${scheduleId}`)
    cancelPublishTask(scheduleId)
  }

  const job = schedule.scheduleJob(scheduleDate, () => {
    console.log(`[PublishScheduler] 定时任务触发，排期ID: ${scheduleId}`)
    PublishTaskService.executePublish(scheduleId)
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
  initHeartbeatChecker,
  stopHeartbeatChecker,
  schedulePublishTask,
  cancelPublishTask,
  PublishTaskService,
}
